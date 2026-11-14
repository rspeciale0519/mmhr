import "server-only";

import postgres from "postgres";

import type { FeedbackInput, FeedbackItem, RecipeInput, ReviewTarget } from "./model";
import { reviewSchemaSql } from "./schema";

export class ReviewStorageMissingError extends Error {
  constructor() {
    super("Gallery review storage is not configured. Set GALLERY_REVIEW_DATABASE_URL.");
    this.name = "ReviewStorageMissingError";
  }
}

let client: postgres.Sql | null = null;
let schemaReady: Promise<void> | null = null;

/**
 * The review database is separate from the MMHR application database on
 * purpose: it holds only reviewer names and design notes. Prepared statements
 * stay off so the connection also works through a transaction pooler.
 */
async function sql(): Promise<postgres.Sql> {
  const url = process.env.GALLERY_REVIEW_DATABASE_URL;
  if (!url) throw new ReviewStorageMissingError();
  client ??= postgres(url, { max: 3, idle_timeout: 20, max_lifetime: 60 * 5, prepare: false, onnotice: () => {} });
  const db = client;
  // Two new server processes can race to create the same table. The loser's
  // "already exists" error means the schema is ready. Any other failure is
  // forgotten, so the next request tries again.
  schemaReady ??= db.unsafe(reviewSchemaSql).then(() => undefined, (error: unknown) => {
    if (isAlreadyCreated(error)) return;
    schemaReady = null;
    throw error;
  });
  await schemaReady;
  return db;
}

const alreadyCreatedCodes = new Set(["42P07", "42710", "23505"]);
const isAlreadyCreated = (error: unknown) =>
  typeof error === "object" && error !== null && alreadyCreatedCodes.has(String((error as { code?: unknown }).code));

export const isReviewStorageConfigured = () => Boolean(process.env.GALLERY_REVIEW_DATABASE_URL);

export async function saveFeedback(input: FeedbackInput): Promise<{ id: string; createdAt: string }> {
  const body = input.kind === "pick" ? null : input.body;
  const x = input.kind === "comment" ? input.x : null;
  const y = input.kind === "comment" ? input.y : null;
  const db = await sql();
  const [row] = await db<{ id: string; created_at: Date }[]>`
    insert into gallery_feedback (reviewer, kind, design, part, body, x, y)
    values (${input.reviewer}, ${input.kind}, ${input.design}, ${input.part}, ${body}, ${x}, ${y})
    returning id, created_at`;
  return { id: row!.id, createdAt: row!.created_at.toISOString() };
}

/** Comments and notes for one design, newest first, so reviewers see earlier pins. */
export async function listFeedback(design: ReviewTarget): Promise<FeedbackItem[]> {
  const db = await sql();
  const rows = await db<{
    id: string; created_at: Date; reviewer: string; kind: "comment" | "note";
    part: string | null; body: string; x: number | null; y: number | null;
  }[]>`
    select id, created_at, reviewer, kind, part, body, x, y
    from gallery_feedback
    where design = ${design} and kind in ('comment', 'note')
    order by created_at desc
    limit 200`;
  return rows.map((row) => ({
    id: row.id, createdAt: row.created_at.toISOString(), reviewer: row.reviewer, kind: row.kind,
    part: row.part, body: row.body, x: row.x, y: row.y,
  }));
}

/**
 * Removes one pick. Only picks can be removed: their ids are never listed back,
 * so only the browser that made a pick knows its id. Comment ids are public.
 */
export async function removePick(id: string): Promise<void> {
  const db = await sql();
  await db`delete from gallery_feedback where id = ${id} and kind = 'pick'`;
}

export async function saveRecipe(input: RecipeInput): Promise<{ id: string; createdAt: string }> {
  const db = await sql();
  const [row] = await db<{ id: string; created_at: Date }[]>`
    insert into gallery_recipes (reviewer, base_design, selections, notes)
    values (${input.reviewer}, ${input.baseDesign}, ${db.json(input.selections)}, ${input.notes})
    returning id, created_at`;
  return { id: row!.id, createdAt: row!.created_at.toISOString() };
}

export type InboxFeedbackRow = {
  id: string; createdAt: string; reviewer: string; kind: "comment" | "note" | "pick";
  design: string; part: string | null; body: string | null;
};

export type InboxRecipeRow = {
  id: string; createdAt: string; reviewer: string; baseDesign: string | null;
  selections: { part: string; design: string; note: string | null }[]; notes: string | null;
};

export async function readInbox(): Promise<{ feedback: InboxFeedbackRow[]; recipes: InboxRecipeRow[] }> {
  const db = await sql();
  const [feedback, recipes] = await Promise.all([
    db<{ id: string; created_at: Date; reviewer: string; kind: InboxFeedbackRow["kind"]; design: string; part: string | null; body: string | null }[]>`
      select id, created_at, reviewer, kind, design, part, body
      from gallery_feedback order by created_at desc limit 2000`,
    db<{ id: string; created_at: Date; reviewer: string; base_design: string | null; selections: InboxRecipeRow["selections"]; notes: string | null }[]>`
      select id, created_at, reviewer, base_design, selections, notes
      from gallery_recipes order by created_at desc limit 200`,
  ]);
  return {
    feedback: feedback.map((row) => ({
      id: row.id, createdAt: row.created_at.toISOString(), reviewer: row.reviewer, kind: row.kind,
      design: row.design, part: row.part, body: row.body,
    })),
    recipes: recipes.map((row) => ({
      id: row.id, createdAt: row.created_at.toISOString(), reviewer: row.reviewer, baseDesign: row.base_design,
      selections: row.selections, notes: row.notes,
    })),
  };
}
