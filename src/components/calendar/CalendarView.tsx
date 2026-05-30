import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, isSameMonth } from "date-fns";
import { CalendarEvent } from "../../types";
import { useCalendarStore } from "../../stores/calendar";
import { useSettingsStore } from "../../stores/settings";
import { useNotesStore } from "../../stores/notes";
import { buildMeetingNoteTemplate } from "../../services/meetingNotes";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";

function FeedLegend() {
  const { settings } = useSettingsStore();
  const enabled = settings.icalFeeds.filter((f) => f.enabled);
  if (enabled.length === 0) return null;
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      {enabled.map((f) => (
        <span key={f.id} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: f.color }} />
          {f.label}
        </span>
      ))}
    </div>
  );
}

type ViewMode = "week" | "month";

interface CalendarViewProps {
  onEventNoteRequest?: (eventId: string, eventTitle: string) => void;
}

export function CalendarView({ onEventNoteRequest }: CalendarViewProps) {
  const { create: createNote, setActive: setActiveNote } = useNotesStore();

  async function handleEventNote(event: CalendarEvent) {
    const { title, content } = buildMeetingNoteTemplate(event);
    const note = await createNote({
      title,
      content,
      tags: ["meeting"],
      sourceType: "manual",
      linkedEventId: event.id,
      linkedEventTitle: event.title,
    });
    setActiveNote(note.id);
    onEventNoteRequest?.(event.id, event.title);
  }
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const { fetchEventsForRange, connected } = useCalendarStore();

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      const evts = await fetchEventsForRange(start, end);
      setEvents(evts);
    } finally {
      setLoading(false);
    }
  }, [fetchEventsForRange]);

  useEffect(() => {
    if (!connected) return;
    const { start, end } = getRange(mode, anchor);
    loadEvents(start, end);
  }, [mode, anchor, connected, loadEvents]);

  function getRange(m: ViewMode, date: Date) {
    if (m === "week") {
      return { start: startOfWeek(date, { weekStartsOn: 0 }), end: endOfWeek(date, { weekStartsOn: 0 }) };
    }
    return { start: startOfMonth(date), end: endOfMonth(date) };
  }

  function prev() {
    setAnchor((d) => mode === "week" ? subWeeks(d, 1) : subMonths(d, 1));
  }

  function next() {
    setAnchor((d) => mode === "week" ? addWeeks(d, 1) : addMonths(d, 1));
  }

  function today() {
    setAnchor(new Date());
  }

  function headerLabel() {
    if (mode === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 0 });
      const e = endOfWeek(anchor, { weekStartsOn: 0 });
      if (isSameMonth(s, e)) return format(s, "MMMM yyyy");
      return `${format(s, "MMM")} – ${format(e, "MMM yyyy")}`;
    }
    return format(anchor, "MMMM yyyy");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Calendar</h1>
          <div className="flex items-center gap-1 rounded-md border border-gray-200 overflow-hidden text-xs">
            {(["week", "month"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 capitalize transition-colors ${mode === m ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-sm font-medium text-gray-700 min-w-40 justify-center">
            {loading && <span className="text-xs text-gray-400">Loading…</span>}
            {headerLabel()}
          </div>
          <button onClick={today} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600">Today</button>
          <div className="flex">
            <button onClick={prev} className="p-1.5 hover:bg-gray-100 rounded-l border border-gray-200 text-gray-500">
              <ChevronLeft size={15} />
            </button>
            <button onClick={next} className="p-1.5 hover:bg-gray-100 rounded-r border border-gray-200 border-l-0 text-gray-500">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <FeedLegend />
      </div>

      {!connected ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
          <Calendar size={40} className="opacity-30" />
          <p className="text-sm">Connect a calendar in Settings to get started.</p>
        </div>
      ) : mode === "week" ? (
        <WeekView anchor={anchor} events={events} onEventNoteRequest={handleEventNote} />
      ) : (
        <MonthView anchor={anchor} events={events} />
      )}
    </div>
  );
}
