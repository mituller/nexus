import { memo } from "react";
import { ExternalLink, GitBranch } from "lucide-react";
import { GitLabIssue } from "../../services/gitlab";
import { GITLAB_PRIORITY_COLORS } from "../../utils/priority";
import { isOverdue, formatShortDate } from "../../utils/calendar";
import { openExternalUrl } from "../../utils/calendar";

interface GitLabItemRowProps {
  issue: GitLabIssue;
  compact?: boolean; // smaller padding for dense lists (Week Ahead)
}

export const GitLabItemRow = memo(function GitLabItemRow({ issue, compact = false }: GitLabItemRowProps) {
  const overdue = issue.dueDate && isOverdue(issue.dueDate);
  const pad = compact ? "px-3 py-2" : "px-4 py-3";

  return (
    <button
      onClick={() => openExternalUrl(issue.webUrl)}
      className={`group w-full flex items-start gap-3 ${pad} bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors text-left`}
    >
      <GitBranch size={compact ? 13 : 16} className="mt-0.5 shrink-0 text-orange-400" />

      <div className="flex-1 min-w-0">
        <p className={`font-medium text-gray-800 dark:text-gray-100 truncate ${compact ? "text-sm" : "text-sm"}`}>
          {issue.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="text-xs text-gray-400 dark:text-gray-500">{issue.projectName} #{issue.iid}</span>
          <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-xs capitalize">
            {issue.issueType}
          </span>
          {issue.priority && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${GITLAB_PRIORITY_COLORS[issue.priority]}`}>
              {issue.priority}
            </span>
          )}
          {issue.iteration && <span className="text-xs text-purple-500">⟳ {issue.iteration}</span>}
          {issue.milestone && <span className="text-xs text-gray-400 dark:text-gray-500">· {issue.milestone}</span>}
          {issue.labels.filter(l => !l.toLowerCase().match(/critical|high|medium|low/)).slice(0, 2).map(label => (
            <span key={label} className="px-1.5 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded text-xs">{label}</span>
          ))}
          {issue.dueDate && (
            <span className={`text-xs ${overdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
              · {overdue ? "Overdue · " : "Due "}{formatShortDate(issue.dueDate)}
            </span>
          )}
        </div>
      </div>

      <ExternalLink size={13} className="shrink-0 text-gray-300 group-hover:text-orange-400 mt-0.5 transition-colors" />
    </button>
  );
});
