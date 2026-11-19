"use server";

import { headers } from "next/headers";
import { RFP_TAB_KEYS } from "@/lib/rfp-form-library";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import {
  removePublicRfpFile, savePublicRfpAnswers, submitPublicRfpForm, type PublicFormResult,
} from "@/server/commands/rfp-vendor-form-public";

/**
 * Server actions for the vendor's RFP web form.
 *
 * A "server action" is a function the browser can call that runs on the
 * server. The vendor is not signed in: the private link token, passed with
 * every call, is what proves which form they may change.
 */

/** Refuses calls that do not come from our own pages. */
async function checkOrigin() {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
}

/** Saves the answers the vendor changed since the last save. */
export async function saveRfpAnswersAction(token: string, answers: unknown): Promise<PublicFormResult> {
  await checkOrigin();
  // Any question in the library is accepted. The database stores answers
  // only on the form this token belongs to.
  return savePublicRfpAnswers(token, answers, RFP_TAB_KEYS);
}

/** Submits the form and locks it. */
export async function submitRfpFormAction(token: string, input: { name: string; email: string }): Promise<PublicFormResult> {
  await checkOrigin();
  return submitPublicRfpForm(token, input);
}

/** Removes one uploaded document. */
export async function removeRfpFileAction(token: string, fileId: string): Promise<PublicFormResult> {
  await checkOrigin();
  return removePublicRfpFile(token, fileId);
}
