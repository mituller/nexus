import { useState, useEffect, useRef, useCallback } from "react";
import { Search, FileText, CheckSquare, BookOpen, X } from "lucide-react";
import { useNotesStore } from "../../stores/notes";
import { useTaskStore } from "../../stores/tasks";
import { useWikiStore } from "../../stores/wiki";

type ResultType = "note" | "task" | "wiki";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  excerpt: string;
}

interface SearchModalProps {
  onClose: () => void;
  onNavigate: (type: ResultType, id: string) => void;
}

const TYPE_ICON: Record<ResultType, React.ReactNode> = {
  note: <FileText size={14} />,
  task: <CheckSquare size={14} />,
  wiki: <BookOpen size={14} />,
};

const TYPE_LABEL: Record<ResultType, string> = {
  note: "Note",
  task: "Task",
  wiki: "Wiki",
};

const TYPE_COLOR: Record<ResultType, string> = {
  note: "text-blue-500",
  task: "text-green-500",
  wiki: "text-purple-500",
};

function excerpt(content: string, query: string, maxLen = 80): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, maxLen);
  const start = Math.max(0, idx - 20);
  const slice = content.slice(start, start + maxLen);
  return (start > 0 ? "…" : "") + slice + (start + maxLen < content.length ? "…" : "");
}

export function SearchModal({ onClose, onNavigate }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { notes } = useNotesStore();
  const { tasks } = useTaskStore();
  const { pages } = useWikiStore();

  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();
    const found: SearchResult[] = [];

    for (const n of notes) {
      if (n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)) {
        found.push({
          id: n.id, type: "note",
          title: n.title,
          excerpt: excerpt(n.content.replace(/#{1,6}\s/g, ""), q),
        });
      }
    }

    for (const t of tasks) {
      if (t.title.toLowerCase().includes(lower) || (t.description ?? "").toLowerCase().includes(lower)) {
        found.push({
          id: t.id, type: "task",
          title: t.title,
          excerpt: t.description ? excerpt(t.description, q) : `${t.priority} priority · ${t.status}`,
        });
      }
    }

    for (const p of pages) {
      if (p.title.toLowerCase().includes(lower) || p.content.toLowerCase().includes(lower)) {
        found.push({
          id: p.id, type: "wiki",
          title: p.title,
          excerpt: excerpt(p.content.replace(/#{1,6}\s/g, ""), q),
        });
      }
    }

    setResults(found.slice(0, 12));
    setActive(0);
  }, [notes, tasks, pages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 120);
    return () => clearTimeout(timer);
  }, [query, search]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) {
      const r = results[active];
      onNavigate(r.type, r.id);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  function renderTitle(title: string) {
    if (!query) return title;
    const parts = title.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((p, i) =>
      p.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-100 text-yellow-800 rounded px-0.5">{p}</mark>
        : p
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-24 z-50 px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search size={16} className="text-gray-400 dark:text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, tasks, wiki…"
            className="flex-1 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border-none outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-gray-300 hover:text-gray-500 dark:text-gray-500">
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex text-xs text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {!query && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">Start typing to search across notes, tasks, and wiki pages.</p>
          )}
          {query && results.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">No results for "{query}"</p>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => { onNavigate(r.type, r.id); onClose(); }}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 last:border-0
                ${i === active ? "bg-blue-50" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
            >
              <span className={`mt-0.5 shrink-0 ${TYPE_COLOR[r.type]}`}>{TYPE_ICON[r.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{renderTitle(r.title)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{r.excerpt}</p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${
                r.type === "note" ? "bg-blue-50 text-blue-600" :
                r.type === "task" ? "bg-green-50 text-green-600" :
                "bg-purple-50 text-purple-600"
              }`}>{TYPE_LABEL[r.type]}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500"><kbd className="border border-gray-200 dark:border-gray-700 rounded px-1 bg-white dark:bg-gray-800">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500"><kbd className="border border-gray-200 dark:border-gray-700 rounded px-1 bg-white dark:bg-gray-800">↵</kbd> open</span>
          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500"><kbd className="border border-gray-200 dark:border-gray-700 rounded px-1 bg-white dark:bg-gray-800">esc</kbd> close</span>
          <span className="ml-auto text-xs text-gray-300">{results.length > 0 ? `${results.length} result${results.length !== 1 ? "s" : ""}` : ""}</span>
        </div>
      </div>
    </div>
  );
}
