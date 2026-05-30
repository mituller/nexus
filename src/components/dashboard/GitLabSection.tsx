import { ExternalLink, GitBranch, AlertCircle, CalendarDays } from "lucide-react";
import { format, parseISO, isBefore } from "date-fns";
import { useGitLabStore } from "../../stores/gitlab";
import { GitLabIssue } from "../../services/gitlab";

const PRIORITY_COLORS: Record<NonNullable<GitLabIssue["priority"]>, string> = {
  critical: "text-red-700 bg-red-50",
  high: "text-orange-700 bg-orange-50",
  medium: "text-yellow-700 bg-yellow-50",
  low: "text-gray-600 dark:text-gray-500 bg-gray-100 dark:bg-gray-700",
};

export function GitLabSection() {
  const { issues, user, loading, connected, error, openIssue } = useGitLabStore();

  if (!connected && !loading && !error) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
        <GitBranch size={13} />
        GitLab — Open Issues
        {user && <span className="normal-case font-normal text-gray-400 dark:text-gray-500">(@{user.username})</span>}
      </h2>

      {loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading issues…</p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} />
          {error.includes("401") ? "Invalid GitLab token — check Settings." : `GitLab error: ${error}`}
        </div>
      )}

      {!loading && !error && issues.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No open issues assigned to you.</p>
      )}

      {issues.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
          {issues.slice(0, 8).map((issue) => (
            <button
              key={issue.id}
              onClick={() => openIssue(issue.webUrl)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 dark:text-gray-100 font-medium truncate">{issue.title}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{issue.projectName} #{issue.iid}</span>
                  {issue.priority && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[issue.priority]}`}>
                      {issue.priority}
                    </span>
                  )}
                  {issue.iteration && (
                    <span className="text-xs text-blue-500">⟳ {issue.iteration}</span>
                  )}
                  {issue.milestone && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">· {issue.milestone}</span>
                  )}
                  {issue.labels.filter((l) => !l.toLowerCase().match(/critical|high|medium|low/)).slice(0, 2).map((label) => (
                    <span key={label} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 rounded text-xs">{label}</span>
                  ))}
                  {issue.dueDate && (() => {
                    const overdue = isBefore(parseISO(issue.dueDate!), new Date());
                    return (
                      <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
                        <CalendarDays size={11} />
                        {overdue ? "Overdue · " : "Due "}
                        {format(parseISO(issue.dueDate!), "MMM d")}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <ExternalLink size={13} className="shrink-0 text-gray-300 group-hover:text-gray-500 dark:text-gray-500 mt-0.5 transition-colors" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
