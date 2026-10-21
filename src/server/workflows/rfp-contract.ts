import "server-only";

import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const reference = z.string().trim().min(1).max(500).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/,
);

export const rfpStatuses = ["draft", "review", "approved", "distributed", "closed", "archived"] as const;
export type RfpStatus = (typeof rfpStatuses)[number];

const rfpSectionSchema = z.strictObject({
  sectionKey: z.string().trim().regex(/^[a-z][a-z0-9_]{0,99}$/),
  title: z.string().trim().min(1).max(200),
  questionCount: z.number().int().min(1).max(500),
});

const rfpVersionSchema = z
  .strictObject({
    rfpId: uuid,
    organizationId: uuid,
    version: z.number().int().min(1),
    status: z.enum(rfpStatuses),
    title: z.string().trim().min(1).max(200),
    sections: z.array(rfpSectionSchema).min(1).max(100),
    createdByIdentityId: uuid,
    createdAt: timestamp,
    approvedByIdentityId: uuid.nullable(),
    approvedAt: timestamp.nullable(),
    approvalReference: reference.regex(/^approval:/, "Approval reference must identify an approval record").nullable(),
  })
  .superRefine((rfp, context) => {
    const keys = rfp.sections.map((section) => section.sectionKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: "custom", path: ["sections"], message: "RFP section keys must be unique" });
    }
    const approvalPresent = [rfp.approvedByIdentityId, rfp.approvedAt, rfp.approvalReference]
      .some((value) => value !== null);
    const approvalComplete = rfp.approvedByIdentityId !== null
      && rfp.approvedAt !== null
      && rfp.approvalReference !== null;
    if (approvalPresent !== approvalComplete) {
      context.addIssue({ code: "custom", path: ["status"], message: "RFP approval evidence must be complete" });
    }
    if (rfp.status === "approved" || rfp.status === "distributed" || rfp.status === "closed") {
      if (!approvalComplete) context.addIssue({ code: "custom", path: ["status"], message: "RFP status requires approval evidence" });
    }
    if ((rfp.status === "draft" || rfp.status === "review") && approvalPresent) {
      context.addIssue({ code: "custom", path: ["status"], message: "Unapproved RFP cannot contain approval evidence" });
    }
  });

const rfpApprovalSchema = z.strictObject({
  rfpId: uuid,
  organizationId: uuid,
  version: z.number().int().min(1),
  approvedByIdentityId: uuid,
  approvedAt: timestamp,
  approvalReference: reference.regex(/^approval:/, "Approval reference must identify an approval record"),
});

export const rfpRecipientStates = ["pending", "distributed", "acknowledged", "responded", "withdrawn"] as const;
export type RfpRecipientState = (typeof rfpRecipientStates)[number];

const rfpRecipientSchema = z.strictObject({
  recipientId: uuid,
  rfpId: uuid,
  organizationId: uuid,
  vendorProfileId: uuid,
  state: z.enum(rfpRecipientStates),
  sentAt: timestamp.nullable(),
  respondedAt: timestamp.nullable(),
});

export type RfpVersion = z.output<typeof rfpVersionSchema>;
export type RfpApproval = z.output<typeof rfpApprovalSchema>;
export type RfpRecipient = z.output<typeof rfpRecipientSchema>;

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

export function parseRfpVersion(value: unknown): RfpVersion {
  const result = rfpVersionSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid RFP version");
  return result.data;
}

export function parseRfpRecipient(value: unknown): RfpRecipient {
  const result = rfpRecipientSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid RFP recipient");
  return result.data;
}

/** Approves one immutable RFP version. Draft content is never edited in place. */
export function approveRfpVersion(versionInput: unknown, approvalInput: unknown): Readonly<RfpVersion> {
  const version = parseRfpVersion(versionInput);
  const approvalResult = rfpApprovalSchema.safeParse(approvalInput);
  if (!approvalResult.success) throw new Error("Invalid RFP approval");
  const approval = approvalResult.data;
  if (version.status !== "draft" && version.status !== "review") throw new Error("Only draft or review RFPs can be approved");
  if (version.rfpId !== approval.rfpId || version.organizationId !== approval.organizationId || version.version !== approval.version) {
    throw new Error("RFP approval does not match the version");
  }
  return freeze({
    ...version,
    status: "approved" as const,
    approvedByIdentityId: approval.approvedByIdentityId,
    approvedAt: approval.approvedAt,
    approvalReference: approval.approvalReference,
    sections: version.sections.map((section) => ({ ...section })),
  });
}

/** Distributes only an approved version to unique, organization-matched recipients. */
export function distributeRfp(input: {
  version: unknown;
  recipients: readonly unknown[];
  distributedAt: string;
}): Readonly<{ version: Readonly<RfpVersion>; recipients: readonly Readonly<RfpRecipient>[] }> {
  const version = parseRfpVersion(input.version);
  if (version.status !== "approved") throw new Error("Only approved RFPs can be distributed");
  if (!timestamp.safeParse(input.distributedAt).success) throw new Error("Invalid RFP distribution timestamp");
  const recipients = input.recipients.map(parseRfpRecipient);
  const ids = new Set<string>();
  const vendors = new Set<string>();
  for (const recipient of recipients) {
    if (recipient.rfpId !== version.rfpId || recipient.organizationId !== version.organizationId) {
      throw new Error("RFP recipient scope mismatch");
    }
    if (recipient.state !== "pending" || recipient.sentAt !== null || recipient.respondedAt !== null) {
      throw new Error("RFP recipient is not pending");
    }
    if (ids.has(recipient.recipientId) || vendors.has(recipient.vendorProfileId)) {
      throw new Error("RFP recipients must be unique");
    }
    ids.add(recipient.recipientId);
    vendors.add(recipient.vendorProfileId);
  }
  return freeze({
    version: freeze({ ...version, status: "distributed" as const, sections: version.sections.map((section) => ({ ...section })) }),
    recipients: freeze(recipients.map((recipient) => freeze({
      ...recipient,
      state: "distributed" as const,
      sentAt: input.distributedAt,
    }))),
  });
}

export { rfpSectionSchema, rfpVersionSchema, rfpApprovalSchema, rfpRecipientSchema };
