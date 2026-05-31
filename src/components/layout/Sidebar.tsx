import { LayoutDashboard, CheckSquare, StickyNote, BookOpen, CalendarDays, Settings, Search, Zap, CalendarRange, Ticket } from "lucide-react";
import { useTaskStore } from "../../stores/tasks";
import { useFreshserviceStore } from "../../stores/freshservice";

type View = "dashboard" | "tasks" | "calendar" | "notes" | "wiki" | "settings" | "weekly" | "tickets";

interface SidebarProps {
  current: View;
  onChange: (v: View) => void;
  onSearch: () => void;
  onCapture: () => void;
}

export function Sidebar({ current, onChange, onSearch, onCapture }: SidebarProps) {
  const openTaskCount = useTaskStore((s) => s.tasks.filter((t) => t.status !== "done").length);
  const openTicketCount = useFreshserviceStore((s) => s.tickets.length);

  const nav: { id: View; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
    { id: "calendar", icon: <CalendarDays size={18} />, label: "Calendar" },
    { id: "weekly", icon: <CalendarRange size={18} />, label: "Week Ahead" },
    { id: "tasks", icon: <CheckSquare size={18} />, label: "Tasks", badge: openTaskCount || undefined },
    { id: "tickets", icon: <Ticket size={18} />, label: "Tickets", badge: openTicketCount || undefined },
    { id: "notes", icon: <StickyNote size={18} />, label: "Notes" },
    { id: "wiki", icon: <BookOpen size={18} />, label: "Wiki" },
    { id: "settings", icon: <Settings size={18} />, label: "Settings" },
  ];

  return (
    <aside className="w-52 shrink-0 bg-gray-900 flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-700 flex items-center gap-2.5">
        <img src="/src/assets/icon.svg" alt="" className="w-7 h-7 shrink-0" />
        <span className="text-white font-semibold text-lg tracking-tight">Nexus</span>
      </div>

      {/* Search + Quick Capture */}
      <div className="px-2 pt-3 pb-1 space-y-1">
        <button
          onClick={onSearch}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-500 bg-gray-800 hover:bg-gray-700 hover:text-gray-300 transition-colors"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-xs text-gray-600 border border-gray-700 rounded px-1">⌘K</kbd>
        </button>
        <button
          onClick={onCapture}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-500 bg-gray-800 hover:bg-gray-700 hover:text-gray-300 transition-colors"
        >
          <Zap size={14} />
          <span className="flex-1 text-left">Quick capture</span>
          <kbd className="text-xs text-gray-600 border border-gray-700 rounded px-1">⇧⌘N</kbd>
        </button>
      </div>

      <nav className="flex-1 py-2 space-y-0.5 px-2">
        {nav.map(({ id, icon, label, badge }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              current === id
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            {icon}
            <span className="flex-1 text-left">{label}</span>
            {badge !== undefined && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full min-w-5 text-center
                ${current === id ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-300"}`}>
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}
