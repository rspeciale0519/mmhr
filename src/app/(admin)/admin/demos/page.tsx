import { DemoWorkspace } from "@/components/workflow/demo-workspace";
export default async function StaffDemos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DemoWorkspace view="staff" searchParams={searchParams} />;
}
