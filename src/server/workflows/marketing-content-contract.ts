import "server-only";

import { z } from "zod";

const contentSchema = z.strictObject({
  contentId: z.string().uuid(),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  body: z.string().trim().min(1).max(20_000),
  sourceReference: z.string().trim().min(1).max(240),
  sourceCapturedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["draft", "approved", "published", "archived"]),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type MarketingContent = z.infer<typeof contentSchema>;

export function parseMarketingContent(value: unknown): MarketingContent {
  const content = contentSchema.parse(value);
  if (content.status === "published" && (content.approvedBy === null || content.approvedAt === null)) throw new Error("Published content requires approval");
  if (content.status === "published" && (content.sourceReference.length === 0 || !content.sourceCapturedAt)) throw new Error("Published content requires source evidence");
  return content;
}

export function approveMarketingContent(content: MarketingContent, reviewerId: string, approvedAt: string): MarketingContent {
  const reviewer = z.string().uuid().parse(reviewerId);
  if (content.status !== "draft" || reviewer === content.approvedBy) throw new Error("Content approval is not allowed");
  return parseMarketingContent({ ...content, status: "approved", approvedBy: reviewer, approvedAt: z.iso.datetime({ offset: true }).parse(approvedAt) });
}

export function canPublishMarketingContent(content: MarketingContent): boolean {
  return content.status === "approved" && content.sourceReference.length > 0 && Boolean(content.sourceCapturedAt) && content.approvedBy !== null && content.approvedAt !== null;
}
