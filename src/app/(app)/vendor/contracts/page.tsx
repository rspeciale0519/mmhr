import { ContractWorkspace } from "@/components/workflow/contract-workspace";
export default async function VendorContracts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ContractWorkspace view="vendor" searchParams={searchParams}/>;
}
