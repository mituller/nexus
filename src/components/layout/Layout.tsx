import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "../dashboard/Dashboard";
import { TaskList } from "../tasks/TaskList";
import { CalendarView } from "../calendar/CalendarView";
import { Settings } from "../settings/Settings";
import { NotesView } from "../notes/NotesView";
import { WikiView } from "../wiki/WikiView";
import { WeeklyPlanView } from "../planning/WeeklyPlanView";
import { TicketsView } from "../tickets/TicketsView";
import { SearchModal } from "../ui/SearchModal";
import { QuickCapture } from "../ui/QuickCapture";
import { useNotesStore } from "../../stores/notes";
import { useWikiStore } from "../../stores/wiki";
import { useFolderWatcherStore } from "../../stores/folderWatcher";

type View = "dashboard" | "tasks" | "calendar" | "notes" | "wiki" | "settings" | "weekly" | "tickets";

export function Layout() {
  const [view, setView] = useState<View>("dashboard");
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const { setActive: setActiveNote } = useNotesStore();
  const { setActive: setActiveWikiPage } = useWikiStore();
  const { clearBadge: clearNotesBadge } = useFolderWatcherStore();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        setCaptureOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSearchNavigate(type: "note" | "task" | "wiki" | "gitlab" | "ticket", id: string) {
    if (type === "note") { setView("notes"); setActiveNote(id); }
    else if (type === "task") { setView("tasks"); }
    else if (type === "wiki") { setView("wiki"); setActiveWikiPage(id); }
    else if (type === "gitlab") { setView("tasks"); }
    else if (type === "ticket") { setView("tickets"); }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar current={view} onChange={(v) => { setView(v); if (v === "notes") clearNotesBadge(); }} onSearch={() => setSearchOpen(true)} onCapture={() => setCaptureOpen(true)} />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {view === "dashboard" && <Dashboard />}
        {view === "tasks" && <TaskList onOpenNote={(noteId) => { setActiveNote(noteId); setView("notes"); }} />}
        {view === "calendar" && <CalendarView onEventNoteRequest={() => setView("notes")} />}
        {view === "notes" && <NotesView />}
        {view === "wiki" && <WikiView />}
        {view === "weekly" && <WeeklyPlanView />}
        {view === "tickets" && <TicketsView />}
        {view === "settings" && <Settings />}
      </main>
      {searchOpen && (
        <SearchModal onClose={() => setSearchOpen(false)} onNavigate={handleSearchNavigate} />
      )}
      {captureOpen && (
        <QuickCapture
          onClose={() => setCaptureOpen(false)}
          onNavigate={(v) => setView(v)}
        />
      )}
    </div>
  );
}
