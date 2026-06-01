import { GitBranch, AlertCircle } from "lucide-react";
import { useGitLabStore } from "../../stores/gitlab";
import { GitLabItemRow } from "../gitlab/GitLabItemRow";

export function GitLabSection() {
  const { issues, user, loading, connected, error } = useGitLabStore();

  if (!connected && !loading && !error) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
        <GitBranch size={13} />
        GitLab — Open Items
        {user && <span className="normal-case font-normal text-gray-400 dark:text-gray-500">(@{user.username})</span>}
      </h2>

      {loading && <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading issues…</p>}

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
        <div className="space-y-1">
          {issues.slice(0, 8).map((issue) => (
            <GitLabItemRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </section>
  );
}
