import type { GitLabIssue } from "../services/gitlab";
import type { TicketPriority } from "../services/freshservice";

export const GITLAB_PRIORITY_COLORS: Record<NonNullable<GitLabIssue["priority"]>, string> = {
  critical: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  high:     "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
  medium:   "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400",
  low:      "text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400",
};

export const FRESHSERVICE_PRIORITY_COLORS: Record<TicketPriority, string> = {
  urgent: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  high:   "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
  medium: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400",
  low:    "text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400",
};
