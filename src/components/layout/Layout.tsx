import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "../dashboard/Dashboard";
import { TaskList } from "../tasks/TaskList";
import { CalendarView } from "../calendar/CalendarView";
import { Settings } from "../settings/Settings";
import { NotesView } from "../notes/NotesView";
import { WikiView } from "../wiki/WikiView";
import { WeeklyPlanView } from "../planning/WeeklyPlanView";
import { SearchModal } from "../ui/SearchModal";
import { QuickCapture } from "../ui/QuickCapture";
import { useNotesStore } from "../../stores/notes";
import { useWikiStore } from "../../stores/wiki";
import { useFolderWatcherStore } from "../../stores/folderWatcher";
import { buildMeetingNoteTemplate } from "../../services/meetingNotes";
import { CalendarEvent } from "../../types";

type View = "dashboard" | "tasks" | "calendar" | "notes" | "wiki" | "settings" | "weekly";

export function Layout() {
  const [view, setView] = useState<View>("dashboard");
  // Task to reveal in the Tasks view, set when arriving from Heads Up or search
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const { setActive: setActiveNote, create: createNote } = useNotesStore();
  const { setActive: setActiveWikiPage } = useWikiStore();
  const { clearBadge: clearNotesBadge } = useFolderWatcherStore();

  const handleAddMeetingNote = useCallback(async function handleAddMeetingNote(event: CalendarEvent) {
    // Reuse existing note for this event if one already exists
    const { notes } = useNotesStore.getState();
    const existing = notes.find((n) => n.linkedEventId === event.id);
    if (existing) {
      setActiveNote(existing.id);
      setView("notes");
      return;
    }
    const { title, content } = buildMeetingNoteTemplate(event);
    const note = await createNote({ title, content, tags: ["meeting"], sourceType: "manual", linkedEventId: event.id, linkedEventTitle: event.title });
    setActiveNote(note.id);
    setView("notes");
  }, [createNote, setActiveNote]);

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

  const handleNavigateTasks = useCallback((taskId?: string) => {
    setView("tasks");
    setFocusTaskId(taskId ?? null);
  }, []);

  const handleFocusHandled = useCallback(() => setFocusTaskId(null), []);

  const handleOpenNoteFromTask = useCallback((noteId: string) => {
    setActiveNote(noteId);
    setView("notes");
  }, [setActiveNote]);

  function handleSearchNavigate(type: "note" | "task" | "wiki" | "git", id: string) {
    if (type === "note") { setView("notes"); setActiveNote(id); }
    else if (type === "task") { setView("tasks"); setFocusTaskId(id); }
    else if (type === "wiki") { setView("wiki"); setActiveWikiPage(id); }
    else if (type === "git") { setView("tasks"); }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar current={view} onChange={(v) => { setView(v); if (v === "notes") clearNotesBadge(); }} onSearch={() => setSearchOpen(true)} onCapture={() => setCaptureOpen(true)} />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {view === "dashboard" && <Dashboard onAddMeetingNote={handleAddMeetingNote} onNavigateTasks={handleNavigateTasks} />}
        {view === "tasks" && <TaskList onOpenNote={handleOpenNoteFromTask} focusTaskId={focusTaskId} onFocusHandled={handleFocusHandled} />}
        {view === "calendar" && <CalendarView onEventNoteRequest={() => setView("notes")} />}
        {view === "notes" && <NotesView />}
        {view === "wiki" && <WikiView />}
        {view === "weekly" && <WeeklyPlanView onAddMeetingNote={handleAddMeetingNote} />}
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
