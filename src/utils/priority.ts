import type { GitIssue, GitPriority } from "../types/git";

export const GIT_PRIORITY_COLORS: Record<NonNullable<GitIssue["priority"]>, string> = {
  critical: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  high:     "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
  medium:   "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400",
  low:      "text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400",
};

/** Infer a priority from issue/PR labels. Shared by the GitLab and GitHub backends. */
export function extractPriorityFromLabels(labels: string[]): GitPriority | undefined {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("critical"))) return "critical";
  if (lower.some((l) => l.includes("high"))) return "high";
  if (lower.some((l) => l.includes("medium"))) return "medium";
  if (lower.some((l) => l.includes("low"))) return "low";
  return undefined;
}