import "server-only";

import { z } from "zod";

import { MAX_SIGNED_URL_LIFETIME_SECONDS } from "./document-safety";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase());
const reference = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/);
const secureUrl = z.url().refine((value) => value.startsWith("https://"), "Signed access must use HTTPS");

const documentVersionSchema = z.strictObject({
  documentId: uuid,
  organizationId: uuid,
  version: z.number().int().min(1),
  state: z.enum(["ready", "approved", "superseded"]),
  sha256,
  storageReference: reference,
  createdAt: timestamp,
  createdByIdentityId: uuid,
});

const signedDocumentAccessSchema = z.strictObject({
  accessReference: uuid,
  documentId: uuid,
  organizationId: uuid,
  version: z.number().int().min(1),
  url: secureUrl,
  issuedAt: timestamp,
  expiresAt: timestamp,
});

export type DocumentVersion = z.output<typeof documentVersionSchema>;
export type SignedDocumentAccess = z.output<typeof signedDocumentAccessSchema>;

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(message);
  return result.data;
}

export function parseDocumentVersion(value: unknown): DocumentVersion {
  return parse(documentVersionSchema, value, "Invalid document version");
}

/** Issues bounded access only for the current, non-superseded document version. */
export function createSignedDocumentAccess(input: {
  version: unknown;
  access: unknown;
}): Readonly<SignedDocumentAccess> {
  const version = parseDocumentVersion(input.version);
  const access = parse(signedDocumentAccessSchema, input.access, "Invalid signed document access");
  if (version.state === "superseded") throw new Error("Superseded document versions cannot be accessed");
  if (
    access.documentId !== version.documentId
    || access.organizationId !== version.organizationId
    || access.version !== version.version
  ) throw new Error("Signed document access scope mismatch");
  const lifetimeSeconds = (Date.parse(access.expiresAt) - Date.parse(access.issuedAt)) / 1_000;
  if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds <= 0 || lifetimeSeconds > MAX_SIGNED_URL_LIFETIME_SECONDS) {
    throw new Error("Signed document access lifetime is not allowed");
  }
  return Object.freeze(access);
}

export { documentVersionSchema, signedDocumentAccessSchema };
