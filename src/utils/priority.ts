import type { GitIssue, GitPriority } from "../types/git";

export const GIT_PRIORITY_COLORS: Record<NonNullable<GitIssue["priority"]>, string> = {
  critical: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  high:     "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
  medium:   "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400",
  low:      "text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400",
};

/** Match whole words only, so "follow-up" isn't low priority or "highlight" high. */
const namesPriority = (label: string, priority: GitPriority) =>
  new RegExp(`(^|[^a-z])${priority}($|[^a-z])`, "i").test(label);

/** True for a label that sets a priority, like "priority::high" or "P: Low". */
export function isPriorityLabel(label: string): boolean {
  return extractPriorityFromLabels([label]) !== undefined;
}

/** Infer a priority from issue/PR labels. Shared by the GitLab and GitHub backends. */
export function extractPriorityFromLabels(labels: string[]): GitPriority | undefined {
  const priorities: GitPriority[] = ["critical", "high", "medium", "low"];
  return priorities.find((p) => labels.some((l) => namesPriority(l, p)));
}
