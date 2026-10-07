import { requireLaunchArea } from "@/lib/launch-surface-guard";
import { FinanceDocumentWorkspace } from "@/components/workflow/finance-document-workspace";
export default function FinanceDocumentReviewPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  requireLaunchArea("finance");
  return <FinanceDocumentWorkspace searchParams={searchParams} review/>;
}
