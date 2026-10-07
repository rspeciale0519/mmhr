import { FinanceDocumentWorkspace } from "@/components/workflow/finance-document-workspace";
export default function FinanceDocumentReviewPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  return <FinanceDocumentWorkspace searchParams={searchParams} review/>;
}
