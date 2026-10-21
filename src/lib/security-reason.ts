import { z } from "zod";

const unsafeReasonPatterns = [
  /[\u0000-\u001f\u007f-\u009f]/,
  /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b(?:mailto|data):/i,
  /[?&](?:token|signature|secret|key|code|x-amz-signature)=/i,
  /\b(?:password|passwd|secret(?:[_ -]?key)?|client[_ -]?secret|api[_ -]?key|(?:(?:access|refresh|session)[_ -]?)?token|session[_ -]?id|authorization|cookie)["']?\s*[:=]\s*\S+/i,
  /\b(?:bearer|basic)\s+\S+/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\b(?:sb_secret_|sk_live_|sk_test_|rk_live_|rk_test_|ghp_|github_pat_)[A-Za-z0-9_]+/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{10,}|\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

// SQL repeats this boundary before storing the reason. Free text can still
// contain private facts; access controls must protect the review record.
export const securityReasonSchema = z.string().trim().min(1).max(500)
  .refine(value => !unsafeReasonPatterns.some(pattern => pattern.test(value)), {
    message: "Use a short reason without secrets or links",
  });
