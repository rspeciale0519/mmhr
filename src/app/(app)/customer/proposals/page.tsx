import { ProposalWorkspace } from "@/components/workflow/proposal-workspace";
export default async function CustomerProposals({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  return <ProposalWorkspace view="customer" searchParams={searchParams}/>;
}
