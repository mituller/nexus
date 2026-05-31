import { useState, useEffect } from "react";
import { Search, Plus, Trash2, ChevronRight } from "lucide-react";
import { useWikiStore } from "../../stores/wiki";
import { WikiEntityType, WikiPage } from "../../types";

const ENTITY_ORDER: WikiEntityType[] = ["person", "project", "decision", "meeting", "concept", "general"];
const ENTITY_LABELS: Record<WikiEntityType, string> = {
  person: "People",
  project: "Projects",
  decision: "Decisions",
  meeting: "Meetings",
  concept: "Concepts",
  general: "General",
};
const ENTITY_COLORS: Record<WikiEntityType, string> = {
  person: "bg-blue-100 text-purple-700",
  project: "bg-green-100 text-green-700",
  decision: "bg-orange-100 text-orange-700",
  meeting: "bg-purple-100 text-purple-700",
  concept: "bg-teal-100 text-teal-700",
  general: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-500",
};

interface WikiPageListProps {
  onNewPage: () => void;
}

export function WikiPageList({ onNewPage }: WikiPageListProps) {
  const { pages, activePageId, setActive, remove, expandedCategories, toggleCategory, expandCategories } = useWikiStore();
  const [search, setSearch] = useState("");

  const filtered = pages.filter(
    (p) =>
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = ENTITY_ORDER.reduce<Record<WikiEntityType, WikiPage[]>>((acc, type) => {
    acc[type] = filtered.filter((p) => p.entityType === type);
    return acc;
  }, {} as Record<WikiEntityType, WikiPage[]>);

  // Auto-expand categories that have search matches
  useEffect(() => {
    if (!search) return;
    const matchingTypes = ENTITY_ORDER.filter((t) => grouped[t].length > 0);
    if (matchingTypes.length > 0) expandCategories(matchingTypes);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="px-3 pt-4 pb-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onNewPage}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            <Plus size={14} /> New page
          </button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search wiki…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
            {search ? "No matching pages." : "No wiki pages yet. Use Ingest to generate them from your notes."}
          </p>
        )}

        {ENTITY_ORDER.map((type) => {
          const group = grouped[type];
          if (group.length === 0) return null;
          const isOpen = expandedCategories[type] ?? false;

          return (
            <div key={type} className="mb-0.5">
              <button
                onClick={() => toggleCategory(type)}
                className="w-full px-3 py-1.5 flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
              >
                <ChevronRight
                  size={13}
                  className={`text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex-1 text-left">
                  {ENTITY_LABELS[type]}
                </span>
                <span className="text-xs text-gray-300 dark:text-gray-600">{group.length}</span>
              </button>

              {isOpen && group.map((page) => (
                <PageRow
                  key={page.id}
                  page={page}
                  active={page.id === activePageId}
                  onClick={() => setActive(page.id)}
                  onDelete={() => remove(page.id)}
                  colorClass={ENTITY_COLORS[page.entityType]}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PageRowProps {
  page: WikiPage;
  active: boolean;
  colorClass: string;
  onClick: () => void;
  onDelete: () => void;
}

function PageRow({ page, active, colorClass, onClick, onDelete }: PageRowProps) {
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left px-3 py-2 border-b border-gray-50 dark:border-gray-700 transition-colors
        ${active ? "bg-blue-50 dark:bg-purple-900/30 border-l-2 border-l-purple-500" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-sm text-gray-800 dark:text-gray-100 truncate flex-1 pl-4">{page.title}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-0.5 pl-4">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colorClass}`}>
          {page.entityType}
        </span>
        {page.sourceIds.length > 0 && (
          <span className="text-xs text-gray-300 dark:text-gray-600">{page.sourceIds.length} source{page.sourceIds.length !== 1 ? "s" : ""}</span>
        )}
      </div>
    </button>
  );
}

export { ENTITY_COLORS };
