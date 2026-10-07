import { DemoWorkspace } from "@/components/workflow/demo-workspace";
export default async function VendorDemos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DemoWorkspace view="vendor" searchParams={searchParams} />;
}
