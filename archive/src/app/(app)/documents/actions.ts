"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { workspaceDocumentSearchQuerySchema, type WorkspaceDocumentSearchState } from "@/lib/workspace-documents";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { getWorkspaceDocuments } from "@/server/commands/workspace-documents";

const formSchema = z.strictObject({ organizationId: z.uuid().transform((value) => value.toLowerCase()),
  query: z.union([z.literal(""), workspaceDocumentSearchQuerySchema]), afterId: z.uuid().optional() });

/** POST keeps private search terms out of page URLs. The previous state grants no authority. */
export async function searchWorkspaceDocumentsAction(_previous: WorkspaceDocumentSearchState, form: FormData): Promise<WorkspaceDocumentSearchState> {
  try {
    requireTrustedServerActionOrigin((await headers()).get("origin"));
    const values: Record<string, FormDataEntryValue> = {};
    for (const [name, value] of form.entries()) {
      if (name.startsWith("$ACTION_")) continue;
      if (!(["organizationId", "query", "afterId"] as string[]).includes(name) || Object.hasOwn(values, name)) return { status: "error" };
      values[name] = value;
    }
    const input = formSchema.safeParse(values);
    if (!input.success) return { status: "error" };
    const organizationId = await readSelectedOrganizationId();
    if (!organizationId || organizationId !== input.data.organizationId) return { status: "error" };
    const query = input.data.query;
    const page = await getWorkspaceDocuments({ organizationId, correlationId: randomUUID(),
      searchQuery: query || undefined, afterId: input.data.afterId });
    return { status: "success", query, page };
  } catch {
    return { status: "error" };
  }
}
