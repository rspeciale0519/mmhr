import "server-only";

type Diagnostic = "late_settlement" | "late_cleanup";
const messages: Readonly<Record<Diagnostic, string>> = Object.freeze({
  late_settlement: "Original verification late settlement failed",
  late_cleanup: "Original verification late stream cleanup failed",
});
export const ORIGINAL_VERIFICATION_DIAGNOSTIC_FAILURE_LIMIT = 255;
let diagnosticFailures = 0;

/** Fixed messages only. A failed sink retains bounded evidence and cannot reject a detached observer. */
export function reportOriginalVerificationStreamDiagnostic(kind: Diagnostic): void {
  try { console.error(messages[kind]); }
  catch {
    if (diagnosticFailures < ORIGINAL_VERIFICATION_DIAGNOSTIC_FAILURE_LIMIT) diagnosticFailures += 1;
  }
}

/** Internal process-local test evidence; no identifiers, error payloads, or unbounded history. */
export function originalVerificationDiagnosticFailureCount(): number {
  return diagnosticFailures;
}
