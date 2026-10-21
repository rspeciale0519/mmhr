import { z } from "zod";

import { partIds } from "./parts";

/**
 * Every design slug, kept here so the review APIs need not import the design
 * modules. gallery.test.ts checks that this list matches the registry.
 */
export const designSlugs = [
  "orbit", "margin", "shortlist", "atelier", "gridline",
  "mercury", "reeded", "console", "sift", "velocity",
  "lumen", "halo", "plinth", "vista", "fold",
  "stack", "graph", "query", "radar", "launch",
] as const;

export type DesignSlug = (typeof designSlugs)[number];

/** Where feedback can be left: a design, the overview, or the final-design builder. */
export const reviewTargets = [...designSlugs, "gallery", "final"] as const;

export type ReviewTarget = (typeof reviewTargets)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const fraction = z.number().min(0).max(1);

export const feedbackInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("comment"),
    design: z.enum(reviewTargets),
    reviewer: text(80),
    part: z.enum(partIds as [string, ...string[]]).nullable().default(null),
    body: text(4000),
    x: fraction.nullable().default(null),
    y: fraction.nullable().default(null),
  }),
  z.strictObject({
    kind: z.literal("note"),
    design: z.enum(reviewTargets),
    reviewer: text(80),
    part: z.enum(partIds as [string, ...string[]]).nullable().default(null),
    body: text(4000),
  }),
  z.strictObject({
    kind: z.literal("pick"),
    design: z.enum(designSlugs),
    reviewer: text(80),
    part: z.enum(partIds as [string, ...string[]]),
  }),
]);

export type FeedbackInput = z.output<typeof feedbackInputSchema>;

export const recipeInputSchema = z.strictObject({
  reviewer: text(80),
  baseDesign: z.enum(designSlugs).nullable().default(null),
  selections: z.array(z.strictObject({
    part: z.enum(partIds as [string, ...string[]]),
    design: z.enum(designSlugs),
    note: text(1000).nullable().default(null),
  })).max(partIds.length),
  notes: z.string().trim().max(6000).transform((value) => value || null).nullable().default(null),
}).refine((recipe) => recipe.baseDesign !== null || recipe.selections.length > 0, {
  message: "Choose a starting design or at least one piece first.",
}).refine((recipe) => new Set(recipe.selections.map((item) => item.part)).size === recipe.selections.length, {
  message: "Each piece can come from one design only.",
});

export type RecipeInput = z.output<typeof recipeInputSchema>;

/** A comment or note as the browser sees it. Picks are never listed back. */
export type FeedbackItem = {
  id: string;
  createdAt: string;
  reviewer: string;
  kind: "comment" | "note";
  part: string | null;
  body: string;
  x: number | null;
  y: number | null;
};

export const feedbackIdSchema = z.uuid();
