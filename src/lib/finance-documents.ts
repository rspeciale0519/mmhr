import { z } from 'zod';
import { workspaceDocumentListSchema,workspaceDocumentHistoryPageSchema } from './workspace-documents';
export const financeDocumentListSchema=workspaceDocumentListSchema.omit({searchQuery:true});
const historyItem=workspaceDocumentHistoryPageSchema.shape.items.element;
export const financeDocumentHistoryPageSchema=workspaceDocumentHistoryPageSchema.extend({items:z.array(historyItem.extend({
  action:z.enum([...historyItem.shape.action.options,'abandon'])})).max(25)});
export { workspaceDocumentHistorySchema as financeDocumentHistorySchema,
  workspaceDocumentPageSchema as financeDocumentPageSchema,
  workspaceDocumentVersionPageSchema as financeDocumentVersionPageSchema,
  workspaceDocumentVersionsSchema as financeDocumentVersionsSchema } from './workspace-documents';
