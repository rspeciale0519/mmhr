import { ProposalWorkspace } from "@/components/workflow/proposal-workspace";
export default async function StaffProposals({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  return <ProposalWorkspace view="staff" searchParams={searchParams}/>;
}
