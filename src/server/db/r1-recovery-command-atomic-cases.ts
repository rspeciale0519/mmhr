import { createRecoveryFixture } from "./r1-identity-intent-fixtures";
import { asAuthenticated } from "./r1-security-command-fixtures";
import {
  assertRecoveryRejected, confirmedPhoneCheck, createPresence, createPublicRecovery, decideRecovery,
  endRecovery, historicalSession, recoveryReference, requestRecovery, type RecoveryCommandCase,
} from "./r1-recovery-command-fixtures";

export const recoveryAtomicCases: RecoveryCommandCase[] = [
  ...(["presence", "replace presence", "replace expired linked presence", "request", "approve", "deny", "cancel", "expire"] as const)
    .map((operation): RecoveryCommandCase => ({
      name: `rolls back every ${operation} change when its final audit insert fails`,
      async run(sql, foundation) {
        const target = operation === "replace expired linked presence"
          ? await historicalSession(sql, foundation.pair[0])
          : operation === "expire" ? await historicalSession(sql, foundation.target) : foundation.target;
        let requestId = "";
        let reference = recoveryReference();
        let actor = target;
        let action = "identity.recovery.presence.create";
        const expiredOptions = {
          preparePolicy: false,
          presenceCreatedOffsetMs: -32 * 60_000, presenceExpiresOffsetMs: -2 * 60_000,
          requestCreatedOffsetMs: -31 * 60_000, requestExpiresOffsetMs: -60_000,
          approvedOffsetMs: -30 * 60_000, approvalOffsetMs: -30 * 60_000 - 1_000,
        };
        if (operation === "replace presence") {
          await asAuthenticated(sql, target, (caller) => createPresence(caller, recoveryReference().hash), "aal1");
        } else if (operation === "replace expired linked presence") {
          await createRecoveryFixture(sql, foundation, { ...expiredOptions, target, issuer: target });
        } else if (operation === "request") {
          await asAuthenticated(sql, target, (caller) => createPresence(caller, reference.hash), "aal1");
          actor = foundation.pair[0];
          action = "identity.recovery.request";
        } else if (["approve", "deny", "cancel"].includes(operation)) {
          const fixture = await createPublicRecovery(sql, foundation);
          requestId = fixture.request.entity_id;
          reference = fixture.reference;
          actor = operation === "cancel" ? foundation.pair[0] : foundation.pair[1];
          action = `identity.recovery.${operation}`;
          if (operation === "cancel") {
            const decision = await confirmedPhoneCheck(sql);
            await asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, requestId, decision));
          }
        } else if (operation === "expire") {
          requestId = (await createRecoveryFixture(sql, foundation, { ...expiredOptions, target })).requestId;
          actor = foundation.pair[0];
          action = "identity.recovery.expire";
        }
        const decision = { ...await confirmedPhoneCheck(sql), ...(operation === "deny" ? { phoneResult: "not_confirmed" } : {}) };
        // The action comes only from the closed operation list above. Reject
        // the final event, after earlier lifecycle writes have taken place.
        await sql.unsafe(`ALTER TABLE public.audit_events ADD CONSTRAINT r1_recovery_command_audit_failure
          CHECK (action <> '${action}') NOT VALID`);
        await assertRecoveryRejected(sql, actor, async (caller) => {
          if (operation === "request") return requestRecovery(caller, reference.opaqueReference);
          if (operation === "approve" || operation === "deny") return decideRecovery(caller, requestId, decision);
          if (operation === "cancel" || operation === "expire") return endRecovery(caller, requestId, operation === "cancel" ? "cancelled" : "expired");
          return createPresence(caller, reference.hash);
        }, { code: "23514" }, action === "identity.recovery.presence.create" ? "aal1" : "aal2");
      },
    })),
];
