import { useState, useEffect } from "react";
import { Search, Plus, Trash2, ChevronRight, FolderOpen, Folder } from "lucide-react";
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

// Detect "Base Name – Month D, YYYY" date-suffixed meeting pages
const DATED_MEETING_RE = /^(.+)\s[–-]\s(\w+ \d+,\s\d{4})$/;

interface MeetingGroup {
  baseName: string;
  parent: WikiPage | null;      // summary page (no date suffix)
  occurrences: WikiPage[];      // dated pages, sorted newest first
}

function groupMeetings(meetings: WikiPage[]): { groups: MeetingGroup[]; ungrouped: WikiPage[] } {
  const groupMap = new Map<string, MeetingGroup>();

  // First pass: find parent/summary pages (no date suffix)
  for (const page of meetings) {
    if (!DATED_MEETING_RE.test(page.title)) {
      groupMap.set(page.title, { baseName: page.title, parent: page, occurrences: [] });
    }
  }

  // Second pass: assign dated occurrences to parent groups
  const ungrouped: WikiPage[] = [];
  for (const page of meetings) {
    const match = page.title.match(DATED_MEETING_RE);
    if (match) {
      const baseName = match[1].trim();
      const existing = groupMap.get(baseName) ?? { baseName, parent: null, occurrences: [] };
      groupMap.set(baseName, { ...existing, occurrences: [...existing.occurrences, page] });
    } else if (!groupMap.has(page.title)) {
      // Parent page with no occurrences yet — already handled above
    }
  }

  // Standalone parents with occurrences → grouped; parents with no occurrences → ungrouped
  const groups: MeetingGroup[] = [];
  for (const g of groupMap.values()) {
    if (g.occurrences.length > 0) {
      groups.push({ ...g, occurrences: [...g.occurrences].reverse() }); // newest first
    } else if (g.parent) {
      ungrouped.push(g.parent);
    }
  }

  return {
    groups: groups.sort((a, b) => a.baseName.localeCompare(b.baseName)),
    ungrouped: ungrouped.sort((a, b) => a.title.localeCompare(b.title)),
  };
}

interface WikiPageListProps {
  onNewPage: () => void;
}

export function WikiPageList({ onNewPage }: WikiPageListProps) {
  const { pages, activePageId, setActive, remove, expandedCategories, toggleCategory, expandCategories } = useWikiStore();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // Auto-expand categories with search matches
  useEffect(() => {
    if (!search) return;
    const matchingTypes = ENTITY_ORDER.filter((t) => grouped[t].length > 0);
    if (matchingTypes.length > 0) expandCategories(matchingTypes);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleGroup(baseName: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(baseName)) next.delete(baseName); else next.add(baseName);
      return next;
    });
  }

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

              {isOpen && (
                type === "meeting"
                  ? <MeetingSection
                      meetings={group}
                      activePageId={activePageId}
                      setActive={setActive}
                      remove={remove}
                      expandedGroups={expandedGroups}
                      onToggleGroup={toggleGroup}
                      colorClass={ENTITY_COLORS.meeting}
                    />
                  : group.map((page) => (
                      <PageRow
                        key={page.id}
                        page={page}
                        active={page.id === activePageId}
                        onClick={() => setActive(page.id)}
                        onDelete={() => remove(page.id)}
                        colorClass={ENTITY_COLORS[page.entityType]}
                      />
                    ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Meeting section with folder grouping ─────────────────────────────────────

interface MeetingSectionProps {
  meetings: WikiPage[];
  activePageId: string | null;
  setActive: (id: string) => void;
  remove: (id: string) => void;
  expandedGroups: Set<string>;
  onToggleGroup: (baseName: string) => void;
  colorClass: string;
}

function MeetingSection({ meetings, activePageId, setActive, remove, expandedGroups, onToggleGroup, colorClass }: MeetingSectionProps) {
  const { groups, ungrouped } = groupMeetings(meetings);

  return (
    <>
      {/* Grouped recurring meetings */}
      {groups.map((g) => {
        const isExpanded = expandedGroups.has(g.baseName);
        const totalCount = (g.parent ? 1 : 0) + g.occurrences.length;

        return (
          <div key={g.baseName}>
            {/* Folder header — opens parent summary page + toggles occurrences */}
            <div className={`group flex items-center border-b border-gray-50 dark:border-gray-700
              ${g.parent && activePageId === g.parent.id ? "bg-purple-50 dark:bg-purple-900/30 border-l-2 border-l-purple-500" : ""}`}>
              <button
                onClick={() => g.parent && setActive(g.parent.id)}
                className="flex-1 flex items-center gap-1.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-w-0"
              >
                {isExpanded
                  ? <FolderOpen size={13} className="text-purple-400 shrink-0" />
                  : <Folder size={13} className="text-purple-400 shrink-0" />
                }
                <span className="text-sm text-gray-800 dark:text-gray-100 truncate flex-1">{g.baseName}</span>
                <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0">{totalCount}</span>
              </button>
              <button
                onClick={() => onToggleGroup(g.baseName)}
                className="px-2 py-2 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                title={isExpanded ? "Collapse" : "Expand occurrences"}
              >
                <ChevronRight size={12} className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
              </button>
              {g.parent && (
                <button
                  onClick={(e) => { e.stopPropagation(); remove(g.parent!.id); }}
                  className="opacity-0 group-hover:opacity-100 pr-2 text-gray-300 hover:text-red-500 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {/* Dated occurrences */}
            {isExpanded && g.occurrences.map((page) => {
              const dateMatch = page.title.match(DATED_MEETING_RE);
              const dateLabel = dateMatch ? dateMatch[2] : page.title;
              return (
                <button
                  key={page.id}
                  onClick={() => setActive(page.id)}
                  className={`group w-full text-left pl-8 pr-3 py-1.5 border-b border-gray-50 dark:border-gray-700 transition-colors
                    ${activePageId === page.id ? "bg-purple-50 dark:bg-purple-900/30 border-l-2 border-l-purple-500" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{dateLabel}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(page.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}

      {/* Ungrouped standalone meetings */}
      {ungrouped.map((page) => (
        <PageRow
          key={page.id}
          page={page}
          active={page.id === activePageId}
          onClick={() => setActive(page.id)}
          onDelete={() => remove(page.id)}
          colorClass={colorClass}
        />
      ))}
    </>
  );
}

// ─── Standard page row ────────────────────────────────────────────────────────

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
        ${active ? "bg-purple-50 dark:bg-purple-900/30 border-l-2 border-l-purple-500" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-sm text-gray-800 dark:text-gray-100 truncate flex-1 pl-4">{page.title}</p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </div>
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
