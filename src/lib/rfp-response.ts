import { z } from "zod";

export const responseFields = {
  supportedRequirements: "Supported requirements",
  unsupportedRequirements: "Unsupported requirements",
  caveats: "Conditions and limits",
  dependencies: "Dependencies",
  commitments: "Commitments",
  implementationDetails: "Implementation details",
  missingAnswers: "Unanswered questions",
  proposedFollowUps: "Proposed follow-ups",
} as const;
export type ResponseField = keyof typeof responseFields;
const byteLength = (value: string) => new TextEncoder().encode(value).length;
const statements = z.array(z.string().trim().min(1)
  .refine((value) => byteLength(value) <= 2000, "Each statement must use at most 2,000 bytes.")).max(100);
export const portalResponseContentSchema = z.strictObject({
  supportedRequirements: statements, unsupportedRequirements: statements,
  caveats: statements, dependencies: statements, commitments: statements,
  implementationDetails: statements, missingAnswers: statements, proposedFollowUps: statements,
}).refine((value) => Object.values(value).some((items) => items.length > 0), "Add at least one response statement.")
  .refine((value) => Object.values(value).flat().reduce((total, statement) => total + byteLength(statement), 0) <= 32000,
    "The response must use at most 32,000 bytes.");
export type PortalResponseContent = z.infer<typeof portalResponseContentSchema>;
