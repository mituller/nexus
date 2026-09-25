import { GitBranch, AlertCircle } from "lucide-react";
import { useGitStore, GIT_PROVIDER_LABEL } from "../../stores/git";
import { GitItemRow } from "../git/GitItemRow";

export function GitSection() {
  const { provider, issues, user, loading, connected, error } = useGitStore();

  if (!connected && !loading && !error) return null;
  const label = GIT_PROVIDER_LABEL[provider];

  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
        <GitBranch size={13} />
        {label} — Open Items
        {user && <span className="normal-case font-normal text-gray-400 dark:text-gray-500">(@{user.username})</span>}
      </h2>

      {loading && <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading issues…</p>}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} />
          {error.includes("401") ? `Invalid ${label} token — check Settings.` : `${label} error: ${error}`}
        </div>
      )}

      {!loading && !error && issues.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No open issues assigned to you.</p>
      )}

      {issues.length > 0 && (
        <div className="space-y-1">
          {issues.slice(0, 8).map((issue) => (
            <GitItemRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </section>
  );
}