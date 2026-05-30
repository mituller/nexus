import { useState, useMemo, memo } from "react";
import { Plus, Trash2, CheckCircle2, Circle, ExternalLink, GitBranch, Send } from "lucide-react";
import { format, parseISO, isBefore } from "date-fns";
import { useTaskStore } from "../../stores/tasks";
import { useGitLabStore } from "../../stores/gitlab";
import { useSettingsStore } from "../../stores/settings";
import { Task } from "../../types";
import { GitLabIssue, GitLabMR } from "../../services/gitlab";
import { createGitLabIssue } from "../../services/gitlabWrite";
import { TaskForm } from "./TaskForm";
import { open as openUrl } from "@tauri-apps/plugin-shell";

const PRIORITY_ORDER: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_BG: Record<Task["priority"], string> = {
  high: "text-red-600",
  medium: "text-orange-500",
  low: "text-gray-400 dark:text-gray-500",
};

const GITLAB_PRIORITY_COLOR: Record<NonNullable<GitLabIssue["priority"]>, string> = {
  critical: "text-red-600",
  high: "text-orange-500",
  medium: "text-yellow-600",
  low: "text-gray-400 dark:text-gray-500",
};

export function TaskList() {
  const { tasks, complete, remove, update } = useTaskStore();
  const { issues, mrs, connected: gitlabConnected, openIssue } = useGitLabStore();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const visible = useMemo(
    () => (filter === "open" ? tasks.filter((t) => t.status !== "done") : tasks)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
    [tasks, filter]
  );

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">
            {visible.length} {filter === "open" ? "open" : "total"}
            {gitlabConnected && issues.length > 0 && (
              <span className="ml-1">· {issues.length} GitLab</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
            {(["open", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 capitalize transition-colors ${filter === f ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} /> New task
          </button>
        </div>
      </div>

      {showForm && <TaskForm onClose={() => setShowForm(false)} />}

      {/* Personal tasks */}
      {visible.length === 0 && !gitlabConnected ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No tasks — you're all caught up.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} onComplete={complete} onDelete={remove} onUpdate={update} />
          ))}
        </div>
      )}

      {/* GitLab issues */}
      {gitlabConnected && issues.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
            <GitBranch size={13} />
            GitLab — Open Issues ({issues.length})
          </h2>
          <div className="space-y-1">
            {issues.map((issue) => (
              <GitLabRow key={issue.id} issue={issue} onOpen={openIssue} />
            ))}
          </div>
        </div>
      )}

      {/* GitLab MRs */}
      {gitlabConnected && mrs.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
            <GitBranch size={13} />
            GitLab — My Merge Requests ({mrs.length})
          </h2>
          <div className="space-y-1">
            {mrs.map((mr) => (
              <MRRow key={mr.id} mr={mr} onOpen={openIssue} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Personal task row ────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
}

const TaskRow = memo(function TaskRow({ task, onComplete, onDelete }: TaskRowProps) {
  const isOverdue = task.dueDate && isBefore(parseISO(task.dueDate), new Date()) && task.status !== "done";
  const isDone = task.status === "done";
  const { settings } = useSettingsStore();
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  async function handleCreateIssue() {
    if (!settings.gitlabToken || !settings.gitlabDefaultProjectId) return;
    setCreating(true);
    try {
      const issue = await createGitLabIssue(
        settings.gitlabUrl, settings.gitlabToken,
        settings.gitlabDefaultProjectId,
        task.title, task.description, task.dueDate,
        task.tags
      );
      setCreatedUrl(issue.webUrl);
    } catch (e) {
      console.error("Failed to create GitLab issue:", e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={`group flex items-start gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border transition-colors
      ${isDone ? "border-gray-100 dark:border-gray-700 opacity-60" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
      <button onClick={() => onComplete(task.id)} className="mt-0.5 shrink-0">
        {isDone
          ? <CheckCircle2 size={18} className="text-green-500" />
          : <Circle size={18} className="text-gray-300 hover:text-blue-500 transition-colors" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isDone ? "line-through text-gray-400 dark:text-gray-500" : isOverdue ? "text-red-700" : "text-gray-800 dark:text-gray-100"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className={`text-xs font-medium ${PRIORITY_BG[task.priority]}`}>
            ● {task.priority}
          </span>
          {task.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 rounded text-xs">{tag}</span>
          ))}
          {task.dueDate && (
            <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
              Due {format(parseISO(task.dueDate), "MMM d")}
              {isOverdue && " · overdue"}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {settings.gitlabDefaultProjectId && settings.gitlabToken && !createdUrl && (
          <button
            onClick={handleCreateIssue}
            disabled={creating}
            title="Create GitLab issue"
            className="text-gray-300 hover:text-orange-500 transition-colors"
          >
            {creating ? <Send size={13} className="animate-pulse" /> : <Send size={13} />}
          </button>
        )}
        {createdUrl && (
          <button onClick={() => openUrl(createdUrl)} title="Open in GitLab" className="text-orange-500">
            <ExternalLink size={13} />
          </button>
        )}
        <button onClick={() => onDelete(task.id)} className="text-gray-300 hover:text-red-500 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

// ─── GitLab issue row ─────────────────────────────────────────────────────────

interface GitLabRowProps {
  issue: GitLabIssue;
  onOpen: (url: string) => void;
}

const GitLabRow = memo(function GitLabRow({ issue, onOpen }: GitLabRowProps) {
  const isOverdue = issue.dueDate && isBefore(parseISO(issue.dueDate), new Date());

  return (
    <button
      onClick={() => onOpen(issue.webUrl)}
      className="group w-full flex items-start gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 transition-colors text-left"
    >
      {/* GitLab diamond icon instead of checkbox */}
      <GitBranch size={16} className="mt-0.5 shrink-0 text-orange-400" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{issue.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-xs text-gray-400 dark:text-gray-500">{issue.projectName} #{issue.iid}</span>
          {issue.priority && (
            <span className={`text-xs font-medium ${GITLAB_PRIORITY_COLOR[issue.priority]}`}>
              ● {issue.priority}
            </span>
          )}
          {issue.iteration && (
            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">⟳ {issue.iteration}</span>
          )}
          {issue.milestone && (
            <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 rounded text-xs">{issue.milestone}</span>
          )}
          {issue.labels
            .filter((l) => !l.toLowerCase().match(/critical|high|medium|low/))
            .slice(0, 3)
            .map((label) => (
              <span key={label} className="px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded text-xs">{label}</span>
            ))}
          {issue.dueDate && (
            <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
              Due {format(parseISO(issue.dueDate), "MMM d")}
              {isOverdue && " · overdue"}
            </span>
          )}
        </div>
      </div>

      <ExternalLink size={13} className="shrink-0 text-gray-300 group-hover:text-gray-500 dark:text-gray-500 mt-0.5 transition-colors" />
    </button>
  );
});

// ─── MR row ───────────────────────────────────────────────────────────────────

const MRRow = memo(function MRRow({ mr, onOpen }: { mr: GitLabMR; onOpen: (url: string) => void }) {
  return (
    <button
      onClick={() => onOpen(mr.webUrl)}
      className="group w-full flex items-start gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 transition-colors text-left"
    >
      <GitBranch size={16} className="mt-0.5 shrink-0 text-purple-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {mr.isDraft && <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 rounded text-xs shrink-0">Draft</span>}
          {mr.hasConflicts && <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-xs shrink-0">Conflicts</span>}
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{mr.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-xs text-gray-400 dark:text-gray-500">{mr.projectName} !{mr.iid}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate max-w-32">{mr.sourceBranch}</span>
          {mr.milestone && <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 rounded text-xs">{mr.milestone}</span>}
        </div>
      </div>
      <ExternalLink size={13} className="shrink-0 text-gray-300 group-hover:text-purple-400 mt-0.5 transition-colors" />
    </button>
  );
});
