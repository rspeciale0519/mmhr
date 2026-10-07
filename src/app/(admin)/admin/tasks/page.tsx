import { TaskWorkspace } from "@/components/workflow/task-workspace";
export default async function StaffTasks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TaskWorkspace searchParams={searchParams}/>;
}
