import "server-only";

import {
  AiRunRecordError,
  aiRunIdentifierSchema,
  applyAiRunApproval,
  canPublishAiRun,
  createAiRunRecord,
  type AiApprovalInput,
  type AiRunRecord,
} from "./ai-run-record";

/** Errors raised by the append-only AI run record boundary. */
export class AiRunRecordRepositoryError extends Error {
  constructor(
    readonly code: "INVALID_RUN_ID" | "INVALID_RECORD" | "INVALID_APPROVAL" | "DUPLICATE_RUN" | "NOT_FOUND" | "INVALID_TRANSITION",
  ) {
    super(code === "DUPLICATE_RUN"
      ? "AI run already exists"
      : code === "NOT_FOUND"
        ? "AI run was not found"
        : code === "INVALID_TRANSITION"
          ? "AI run transition is not allowed"
          : code === "INVALID_APPROVAL"
            ? "AI approval is invalid"
          : code === "INVALID_RUN_ID"
            ? "AI run identifier is invalid"
            : "AI run record is invalid");
    this.name = "AiRunRecordRepositoryError";
  }
}

/**
 * Storage contract for immutable AI run snapshots.
 *
 * A database adapter must implement these operations with an append-only
 * transaction and a unique run identifier. It must preserve every revision.
 */
export interface AiRunRecordRepository {
  append(record: unknown): Promise<AiRunRecord>;
  get(runId: string): Promise<AiRunRecord | null>;
  history(runId: string): Promise<readonly AiRunRecord[]>;
  pendingReview(): Promise<readonly AiRunRecord[]>;
  decide(runId: string, input: unknown): Promise<AiRunRecord>;
  publishable(runId: string): Promise<AiRunRecord | null>;
}

const initialRecordStatuses = new Set<AiRunRecord["status"]>([
  "queued",
  "running",
  "validating",
  "review_required",
  "failed",
]);

/**
 * Deterministic local repository for tests and local workflow composition.
 * It is not a production persistence implementation.
 */
export class InMemoryAiRunRecordRepository implements AiRunRecordRepository {
  private readonly revisions = new Map<string, AiRunRecord[]>();

  async append(input: unknown): Promise<AiRunRecord> {
    let record: AiRunRecord;
    try {
      record = createAiRunRecord(input);
    } catch (error) {
      if (error instanceof AiRunRecordError) {
        throw new AiRunRecordRepositoryError("INVALID_RECORD");
      }
      throw error;
    }

    if (!initialRecordStatuses.has(record.status)) {
      throw new AiRunRecordRepositoryError("INVALID_TRANSITION");
    }
    if (this.revisions.has(record.runId)) {
      throw new AiRunRecordRepositoryError("DUPLICATE_RUN");
    }

    this.revisions.set(record.runId, [record]);
    return record;
  }

  async get(runId: string): Promise<AiRunRecord | null> {
    const normalizedRunId = parseRunId(runId);
    return this.revisions.get(normalizedRunId)?.at(-1) ?? null;
  }

  async history(runId: string): Promise<readonly AiRunRecord[]> {
    const normalizedRunId = parseRunId(runId);
    const history = this.revisions.get(normalizedRunId) ?? [];
    return Object.freeze([...history]);
  }

  async pendingReview(): Promise<readonly AiRunRecord[]> {
    const records = [...this.revisions.values()]
      .map((history) => history.at(-1))
      .filter((record): record is AiRunRecord => record?.status === "review_required"
        && record.review.decision === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.runId.localeCompare(right.runId));
    return Object.freeze(records);
  }

  async decide(runId: string, input: unknown): Promise<AiRunRecord> {
    const normalizedRunId = parseRunId(runId);
    const history = this.revisions.get(normalizedRunId);
    const current = history?.at(-1);
    if (!history || !current) throw new AiRunRecordRepositoryError("NOT_FOUND");

    let next: AiRunRecord;
    try {
      next = applyAiRunApproval(current, input);
    } catch (error) {
      if (error instanceof AiRunRecordError) {
        if (error.code === "INVALID_APPROVAL") {
          throw new AiRunRecordRepositoryError("INVALID_APPROVAL");
        }
        throw new AiRunRecordRepositoryError("INVALID_TRANSITION");
      }
      throw error;
    }

    history.push(next);
    return next;
  }

  async publishable(runId: string): Promise<AiRunRecord | null> {
    const record = await this.get(runId);
    return record !== null && canPublishAiRun(record) ? record : null;
  }
}

export function createInMemoryAiRunRecordRepository(): AiRunRecordRepository {
  return new InMemoryAiRunRecordRepository();
}

function parseRunId(input: string): string {
  const parsed = aiRunIdentifierSchema.safeParse(input);
  if (!parsed.success) throw new AiRunRecordRepositoryError("INVALID_RUN_ID");
  return parsed.data;
}

export type AiRunApprovalInput = AiApprovalInput;
