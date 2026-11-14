import "server-only";
import { AuthorizationError } from "@/server/auth/authorization";
export class FinanceDocumentAccessExpiredError extends AuthorizationError {
  constructor(){super();this.name="FinanceDocumentAccessExpiredError";}
}
export class FinanceDocumentInputError extends Error{
  constructor(){super("Invalid finance document request");this.name="FinanceDocumentInputError";}
}
export class FinanceDocumentConflictError extends Error{
  constructor(){super("Finance document request conflicts with its recorded state");this.name="FinanceDocumentConflictError";}
}
export function checkFinanceDocumentRpcError(error:{code?:string}|null|undefined,failureMessage="Finance document request failed"):void{
  if(!error)return;
  if(error.code==="42501")throw new AuthorizationError();
  if(error.code==="22023")throw new FinanceDocumentInputError();
  if(error.code==="40001")throw new FinanceDocumentConflictError();
  throw new Error(failureMessage);
}
