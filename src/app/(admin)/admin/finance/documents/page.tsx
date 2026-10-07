import { FinanceDocumentWorkspace } from "@/components/workflow/finance-document-workspace";
export default function FinanceDocumentsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  return <FinanceDocumentWorkspace searchParams={searchParams}/>;
}
