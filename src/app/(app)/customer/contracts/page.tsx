import { ContractWorkspace } from "@/components/workflow/contract-workspace";
export default async function CustomerContracts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ContractWorkspace view="customer" searchParams={searchParams}/>;
}
