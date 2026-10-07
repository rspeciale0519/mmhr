import { ProposalWorkspace } from "@/components/workflow/proposal-workspace";
export default async function VendorProposals({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  return <ProposalWorkspace view="vendor" searchParams={searchParams}/>;
}
