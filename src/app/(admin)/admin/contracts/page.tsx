import { ContractWorkspace } from "@/components/workflow/contract-workspace";
export default async function StaffContracts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ContractWorkspace view="staff" searchParams={searchParams}/>;
}
