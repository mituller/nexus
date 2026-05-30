import { LayoutDashboard, CheckSquare, StickyNote, BookOpen, CalendarDays, Settings, Search, Zap, CalendarRange } from "lucide-react";

type View = "dashboard" | "tasks" | "calendar" | "notes" | "wiki" | "settings" | "weekly";

interface SidebarProps {
  current: View;
  onChange: (v: View) => void;
  onSearch: () => void;
  onCapture: () => void;
}

const nav: { id: View; icon: React.ReactNode; label: string }[] = [
  { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
  { id: "tasks", icon: <CheckSquare size={18} />, label: "Tasks" },
  { id: "calendar", icon: <CalendarDays size={18} />, label: "Calendar" },
  { id: "weekly", icon: <CalendarRange size={18} />, label: "Week Ahead" },
  { id: "notes", icon: <StickyNote size={18} />, label: "Notes" },
  { id: "wiki", icon: <BookOpen size={18} />, label: "Wiki" },
  { id: "settings", icon: <Settings size={18} />, label: "Settings" },
];

export function Sidebar({ current, onChange, onSearch, onCapture }: SidebarProps) {
  return (
    <aside className="w-52 shrink-0 bg-gray-900 flex flex-col h-full">
      <div className="px-4 py-5 border-b border-gray-700">
        <span className="text-white font-semibold text-lg tracking-tight">Nexus</span>
      </div>

      {/* Search + Quick Capture */}
      <div className="px-2 pt-3 pb-1 space-y-1">
        <button
          onClick={onSearch}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-500 dark:text-gray-500 bg-gray-800 hover:bg-gray-700 hover:text-gray-300 transition-colors"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-xs text-gray-600 dark:text-gray-500 border border-gray-700 rounded px-1">⌘K</kbd>
        </button>
        <button
          onClick={onCapture}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-500 dark:text-gray-500 bg-gray-800 hover:bg-gray-700 hover:text-gray-300 transition-colors"
        >
          <Zap size={14} />
          <span className="flex-1 text-left">Quick capture</span>
          <kbd className="text-xs text-gray-600 dark:text-gray-500 border border-gray-700 rounded px-1">⇧⌘N</kbd>
        </button>
      </div>

      <nav className="flex-1 py-2 space-y-0.5 px-2">
        {nav.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              current === id
                ? "bg-blue-600 text-white"
                : "text-gray-400 dark:text-gray-500 hover:bg-gray-800 hover:text-white"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
