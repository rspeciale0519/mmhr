import { TRPCError } from "@trpc/server";
import { AuthorizationError } from "@/server/auth/authorization";
import { approveRfpVersion, rfpApprovalCommandSchema } from "@/server/commands/rfp-approval";
import { createRfpQuestionnaire, deliverRfpToPortals, getRfpWorkflow, getVendorRfps,
  rfpQuestionnaireInputSchema, rfpPortalDeliveryInputSchema, rfpWorkflowInputSchema, vendorRfpsInputSchema } from "@/server/commands/rfp-portal";
import { permissionProcedure, router } from "../trpc";
import { getRfpNotificationRecipients, getRfpNotificationStatus, queueRfpNotification, retryRfpNotification } from "@/server/commands/rfp-notifications";
import { notificationQueueSchema, notificationReadSchema, notificationRetrySchema } from "@/server/workflows/rfp-notification-contract";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { confirmRfpReceipt, getRfpReceiptStatus, RfpReceiptInputError, RfpReceiptConflictError } from "@/server/commands/rfp-receipt";
import { rfpReceiptCommandSchema, rfpReceiptVendorReadSchema, rfpReceiptStaffReadSchema, rfpReceiptCustomerReadSchema } from "@/lib/rfp-receipt";
async function receiptResult<T>(organizationId: string, operation: () => Promise<T>) {
  try {
    if (await readSelectedOrganizationId() !== organizationId) throw new AuthorizationError();
    return await operation();
  } catch (error) {
    throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND" : error instanceof RfpReceiptInputError ? "BAD_REQUEST"
      : error instanceof RfpReceiptConflictError ? "CONFLICT" : "INTERNAL_SERVER_ERROR", message: "RFP receipt request failed" });
  }
}
const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });
async function result<T>(operation: () => Promise<T>) {
  try { return await operation(); } catch (error) {
    throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR", message: "RFP request failed" });
  }
}
export const rfpsRouter = router({
  confirmReceipt: permissionProcedure({ permission: "portal.vendor.access", input: rfpReceiptCommandSchema, resolveScope })
    .mutation(({ctx,input}) => receiptResult(input.organizationId, () => confirmRfpReceipt(input,{supabase:ctx.supabase}))),
  vendorReceiptStatus: permissionProcedure({ permission: "portal.vendor.access", input: rfpReceiptVendorReadSchema, resolveScope })
    .query(({ctx,input}) => receiptResult(input.organizationId, () => getRfpReceiptStatus(input,{supabase:ctx.supabase}))),
  staffReceiptStatus: permissionProcedure({ permission: "rfp.distribute", input: rfpReceiptStaffReadSchema, resolveScope })
    .query(({ctx,input}) => receiptResult(input.organizationId, () => getRfpReceiptStatus(input,{supabase:ctx.supabase}))),
  customerReceiptStatus: permissionProcedure({ permission: "portal.customer.access", input: rfpReceiptCustomerReadSchema, resolveScope })
    .query(({ctx,input}) => receiptResult(input.organizationId, () => getRfpReceiptStatus(input,{supabase:ctx.supabase}))),
  notificationRecipients: permissionProcedure({ permission: "rfp.distribute", input: notificationReadSchema, resolveScope })
    .query(({ctx,input}) => result(() => getRfpNotificationRecipients(input,{supabase:ctx.supabase}))),
  notificationStatus: permissionProcedure({ permission: "rfp.distribute", input: notificationReadSchema, resolveScope })
    .query(({ctx,input}) => result(() => getRfpNotificationStatus(input,{supabase:ctx.supabase}))),
  queueNotification: permissionProcedure({ permission: "rfp.distribute", input: notificationQueueSchema, resolveScope })
    .mutation(({ctx,input}) => result(() => queueRfpNotification(input,{supabase:ctx.supabase}))),
  retryNotification: permissionProcedure({ permission: "rfp.distribute", input: notificationRetrySchema, resolveScope })
    .mutation(({ctx,input}) => result(() => retryRfpNotification(input,{supabase:ctx.supabase}))),
  workflow: permissionProcedure({ permission: "workspace.access", input: rfpWorkflowInputSchema, resolveScope })
    .query(({ctx,input}) => result(() => getRfpWorkflow(input,{supabase:ctx.supabase}))),
  inbox: permissionProcedure({ permission: "portal.vendor.access", input: vendorRfpsInputSchema, resolveScope })
    .query(({ctx,input}) => result(() => getVendorRfps(input,{supabase:ctx.supabase}))),
  create: permissionProcedure({ permission: "rfp.approve", input: rfpQuestionnaireInputSchema, resolveScope })
    .mutation(({ctx,input}) => result(() => createRfpQuestionnaire(input,{supabase:ctx.supabase}))),
  approve: permissionProcedure({ permission: "rfp.approve", input: rfpApprovalCommandSchema.omit({actorIdentityId:true}), resolveScope })
    .mutation(({ctx,input}) => result(() => approveRfpVersion({...input,actorIdentityId:ctx.authorization.identityId},{supabase:ctx.supabase}))),
  deliver: permissionProcedure({ permission: "rfp.distribute", input: rfpPortalDeliveryInputSchema, resolveScope })
    .mutation(({ctx,input}) => result(() => deliverRfpToPortals(input,{supabase:ctx.supabase}))),
});
