import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "../dashboard/Dashboard";
import { TaskList } from "../tasks/TaskList";
import { CalendarView } from "../calendar/CalendarView";
import { Settings } from "../settings/Settings";
import { NotesView } from "../notes/NotesView";
import { WikiView } from "../wiki/WikiView";
import { SearchModal } from "../ui/SearchModal";
import { useNotesStore } from "../../stores/notes";
import { useWikiStore } from "../../stores/wiki";

type View = "dashboard" | "tasks" | "calendar" | "notes" | "wiki" | "settings";

export function Layout() {
  const [view, setView] = useState<View>("dashboard");
  const [searchOpen, setSearchOpen] = useState(false);
  const { setActive: setActiveNote } = useNotesStore();
  const { setActive: setActiveWikiPage } = useWikiStore();

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSearchNavigate(type: "note" | "task" | "wiki", id: string) {
    if (type === "note") {
      setView("notes");
      setActiveNote(id);
    } else if (type === "task") {
      setView("tasks");
    } else if (type === "wiki") {
      setView("wiki");
      setActiveWikiPage(id);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar current={view} onChange={setView} onSearch={() => setSearchOpen(true)} />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {view === "dashboard" && <Dashboard />}
        {view === "tasks" && <TaskList />}
        {view === "calendar" && <CalendarView />}
        {view === "notes" && <NotesView />}
        {view === "wiki" && <WikiView />}
        {view === "settings" && <Settings />}
      </main>
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onNavigate={handleSearchNavigate}
        />
      )}
    </div>
  );
}
