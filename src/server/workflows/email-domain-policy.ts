import "server-only";

import { z } from "zod";

const email = z.string().trim().toLowerCase().email();
const exceptionSchema = z.strictObject({ reviewerId: z.string().uuid(), reason: z.string().trim().min(1).max(500), approvedAt: z.iso.datetime({ offset: true }) });

const personalDomains = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "proton.me", "protonmail.com"]);

export type EmailDomainDecision = Readonly<{ accepted: boolean; normalizedEmail: string; exception: boolean }>;

export function evaluateWorkEmail(value: unknown, reviewedException?: unknown): EmailDomainDecision {
  const normalizedEmail = email.parse(value);
  const domain = normalizedEmail.slice(normalizedEmail.lastIndexOf("@") + 1);
  const exception = exceptionSchema.safeParse(reviewedException).success;
  return Object.freeze({ accepted: !personalDomains.has(domain) || exception, normalizedEmail, exception });
}
