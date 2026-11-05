import { format, parseISO } from "date-fns";
import { Task, TaskPriority } from "../types";
import { GitIssue, GitPriority } from "../types/git";
import { isPriorityLabel } from "./priority";

const TASK_PRIORITY: Record<GitPriority, TaskPriority> = {
  critical: "high",
  high: "high",
  medium: "medium",
  low: "low",
};

/** True for a task made from a git issue, whose sourceId is the issue's URL rather than a note id. */
export function isGitTask(task: Task): boolean {
  return !!task.sourceId && (task.sourceType === "github" || task.sourceType === "gitlab");
}

/** A new task linked back to the issue. It's a copy: later changes on either side don't sync. */
export function issueToTask(issue: GitIssue): Omit<Task, "id" | "createdAt" | "updatedAt"> {
  return {
    title: issue.title,
    description: `${issue.projectName} #${issue.iid}`,
    status: "open",
    priority: issue.priority ? TASK_PRIORITY[issue.priority] : "medium",
    // GitHub due dates are timestamps, but tasks hold a local yyyy-MM-dd date
    dueDate: issue.dueDate ? format(parseISO(issue.dueDate), "yyyy-MM-dd") : undefined,
    sourceType: issue.provider,
    sourceId: issue.webUrl,
    // Priority labels are already reflected in the task's priority
    tags: issue.labels.filter((l) => !isPriorityLabel(l)),
  };
}
