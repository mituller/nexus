import { useState, useMemo, memo, useRef, useEffect } from "react";
import { Plus, Trash2, CheckCircle2, ExternalLink, GitBranch, Send, Pencil, CalendarDays, ChevronDown, X as XIcon, FileText, Search } from "lucide-react";
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

const PRIORITY_BADGE: Record<Task["priority"], string> = {
  high:   "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  medium: "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  low:    "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
};

const GITLAB_PRIORITY_COLOR: Record<NonNullable<GitLabIssue["priority"]>, string> = {
  critical: "text-red-600",
  high: "text-orange-500",
  medium: "text-yellow-600",
  low: "text-gray-400 dark:text-gray-500",
};

interface TaskListProps {
  onOpenNote?: (noteId: string) => void;
  /** Task to reveal when arriving from Heads Up or search. */
  focusTaskId?: string | null;
  /** Called once the focus request has been handled, so it doesn't re-fire. */
  onFocusHandled?: () => void;
}

export function TaskList({ onOpenNote, focusTaskId, onFocusHandled }: TaskListProps = {}) {
  const { tasks, complete, remove, update } = useTaskStore();
  const { issues, mrs, connected: gitlabConnected, openIssue } = useGitLabStore();
  const [showForm, setShowForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterPriority, setFilterPriority] = useState<Task["priority"] | "all">("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterTag, setFilterTag] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Debounce the text search by 200ms
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Arriving from a Heads Up alert or search: clear any filter that would hide
  // the task, then scroll it into view and highlight it briefly.
  useEffect(() => {
    if (!focusTaskId) return;
    const target = tasks.find((t) => t.id === focusTaskId);
    if (!target) { onFocusHandled?.(); return; }

    setSearchInput("");
    setSearchQuery("");
    setFilterPriority("all");
    setFilterSource("all");
    setFilterTag("");
    if (target.status === "done") setShowCompleted(true);
    setHighlightId(focusTaskId);

    // Wait for the filter reset to render before measuring
    const scrollTimer = setTimeout(() => {
      document
        .querySelector(`[data-task-id="${focusTaskId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    const clearTimer = setTimeout(() => setHighlightId(null), 2400);
    onFocusHandled?.();
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [focusTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    tasks.forEach((t) => t.tags.forEach((tag) => tags.add(tag)));
    return [...tags].sort();
  }, [tasks]);

  const visible = useMemo(() => {
    return [...tasks]
      .filter((t) => showCompleted || t.status !== "done")
      .filter((t) => !searchQuery || t.title.toLowerCase().includes(searchQuery) || (t.description ?? "").toLowerCase().includes(searchQuery))
      .filter((t) => filterPriority === "all" || t.priority === filterPriority)
      .filter((t) => filterSource === "all" || t.sourceType === filterSource)
      .filter((t) => !filterTag || t.tags.includes(filterTag))
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [tasks, showCompleted, searchQuery, filterPriority, filterSource, filterTag]);

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {tasks.filter(t => t.status !== "done").length} open
            {tasks.filter(t => t.status === "done").length > 0 && (
              <button
                onClick={() => setShowCompleted(v => !v)}
                className="text-gray-400 dark:text-gray-600 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                {" · "}{tasks.filter(t => t.status === "done").length} completed {showCompleted ? "↑ hide" : "↓ show"}
              </button>
            )}
            {gitlabConnected && issues.length > 0 && (
              <span className="ml-1">· {issues.length} GitLab</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            <Plus size={14} /> New task
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search tasks…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-6 pr-3 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 w-44"
            />
          </div>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as Task["priority"] | "all")}
            className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500">
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500">
            <option value="all">All sources</option>
            <option value="manual">Manual</option>
            <option value="calendar">Calendar</option>
            <option value="transcript">Transcript / Email</option>
            <option value="gitlab">GitLab</option>
          </select>
          {allTags.length > 0 && (
            <TagCombobox tags={allTags} value={filterTag} onChange={setFilterTag} />
          )}
          {(searchInput || filterPriority !== "all" || filterSource !== "all" || filterTag) && (
            <button onClick={() => { setSearchInput(""); setFilterPriority("all"); setFilterSource("all"); setFilterTag(""); }}
              className="text-xs text-blue-500 hover:text-purple-700 underline">
              Clear filters
            </button>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-600 ml-auto">{visible.filter(t => t.status !== "done").length} shown</span>
        </div>
      )}

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
            <TaskRow key={task.id} task={task} onComplete={complete} onDelete={remove} onUpdate={update} onOpenNote={onOpenNote} highlight={task.id === highlightId} />
          ))}
        </div>
      )}

      {/* GitLab issues */}
      {gitlabConnected && issues.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
            <GitBranch size={13} />
            GitLab — Open Items ({issues.length})
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
  onOpenNote?: (noteId: string) => void;
  highlight?: boolean;
}

const TaskRow = memo(function TaskRow({ task, onComplete, onDelete, onUpdate, onOpenNote, highlight }: TaskRowProps) {
  const isOverdue = task.dueDate && isBefore(parseISO(task.dueDate), new Date()) && task.status !== "done";
  const isDone = task.status === "done";
  const { settings } = useSettingsStore();
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <TaskForm task={task} onClose={() => setEditing(false)} />;
  }

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
    <div
      data-task-id={task.id}
      className={`group flex items-start gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border transition-all
      ${highlight ? "border-purple-400 ring-2 ring-purple-300 dark:ring-purple-700" : isDone ? "border-gray-100 dark:border-gray-700 opacity-60" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => isDone ? onUpdate(task.id, { status: "open" }) : onComplete(task.id)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700"
        title={isDone ? "Mark as open" : "Mark as done"}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isDone ? "line-through text-gray-400 dark:text-gray-500" : isOverdue ? "text-red-700" : "text-gray-800 dark:text-gray-100"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${PRIORITY_BADGE[task.priority]}`}>
            {task.priority}
          </span>
          {task.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 rounded text-xs">{tag}</span>
          ))}
          <span className={`flex items-center gap-1 text-xs ${isOverdue ? "text-red-500 font-medium" : task.dueDate ? "text-gray-500 dark:text-gray-400" : "text-gray-300 dark:text-gray-600"}`}>
            <CalendarDays size={11} />
            {task.dueDate
              ? <>Due {format(parseISO(task.dueDate), "MMM d")}{isOverdue && " · overdue"}</>
              : "No due date"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {task.sourceId && onOpenNote && (
          <button
            onClick={() => onOpenNote(task.sourceId!)}
            title="Open source note"
            className="text-gray-300 hover:text-purple-500 transition-colors"
          >
            <FileText size={13} />
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          title="Edit task"
          className="text-gray-300 hover:text-purple-500 transition-colors"
        >
          <Pencil size={13} />
        </button>
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
            <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-xs capitalize">{issue.issueType}</span>
          {issue.priority && (
            <span className={`text-xs font-medium ${GITLAB_PRIORITY_COLOR[issue.priority]}`}>
              ● {issue.priority}
            </span>
          )}
          {issue.iteration && (
            <span className="px-1.5 py-0.5 bg-blue-50 text-purple-600 rounded text-xs">⟳ {issue.iteration}</span>
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

// ─── Tag combobox ─────────────────────────────────────────────────────────────

function TagCombobox({ tags, value, onChange }: { tags: string[]; value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() =>
    tags.filter((t) => t.toLowerCase().includes(search.toLowerCase())),
    [tags, search]
  );

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(tag: string) {
    onChange(tag);
    setSearch("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setSearch("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center gap-1 px-2 py-1 text-xs border rounded-md bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400
          ${open ? "border-purple-500 ring-1 ring-purple-500" : "border-gray-200 dark:border-gray-700"}`}
        style={{ minWidth: "120px" }}
      >
        <input
          type="text"
          value={value ? value : search}
          placeholder="Filter by tag…"
          readOnly={!!value}
          onClick={() => { if (value) clear(); else setOpen(true); }}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => { if (!value) setOpen(true); }}
          className="flex-1 bg-transparent outline-none placeholder-gray-400 dark:placeholder-gray-600 min-w-0"
          style={{ width: "90px" }}
        />
        {value ? (
          <button onClick={clear} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <XIcon size={11} />
          </button>
        ) : (
          <ChevronDown size={11} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-52 overflow-y-auto min-w-full">
          {filtered.map((tag) => (
            <button
              key={tag}
              onMouseDown={(e) => { e.preventDefault(); select(tag); }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-purple-700 dark:hover:text-blue-300 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
