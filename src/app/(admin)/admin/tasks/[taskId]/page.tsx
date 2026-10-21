import { TaskWorkspace } from "@/components/workflow/task-workspace";
export default async function StaffTask({ params, searchParams }: { params: Promise<{ taskId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TaskWorkspace taskId={(await params).taskId} searchParams={searchParams}/>;
}
