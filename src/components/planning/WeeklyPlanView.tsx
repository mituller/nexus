import { useState, useEffect } from "react";
import { RefreshCw, Calendar, CheckSquare, Sparkles, GitBranch, Ticket } from "lucide-react";
import { format, startOfDay, endOfDay, addDays, parseISO, isBefore } from "date-fns";
import { GitLabItemRow } from "../gitlab/GitLabItemRow";
import { FreshserviceTicketRow } from "../tickets/FreshserviceTicketRow";
import { useCalendarStore } from "../../stores/calendar";
import { useTaskStore } from "../../stores/tasks";
import { useSettingsStore } from "../../stores/settings";
import { useGitLabStore } from "../../stores/gitlab";
import { useFreshserviceStore } from "../../stores/freshservice";
import { useWeeklyStore } from "../../stores/weekly";
import { MeetingCard } from "../dashboard/MeetingCard";
import { TaskItem, sortTasks } from "../ui/TaskItem";
import { CalendarEvent } from "../../types";

export function WeeklyPlanView({ onAddMeetingNote }: { onAddMeetingNote?: (event: CalendarEvent) => void } = {}) {
  const { settings } = useSettingsStore();
  const { fetchEventsForRange } = useCalendarStore();
  const { tasks, complete } = useTaskStore();
  const { issues } = useGitLabStore();
  const { tickets } = useFreshserviceStore();
  const { narrative, loading: loadingNarrative, generatedAt, generate: generateNarrative } = useWeeklyStore();

  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const cfg = { profile: settings.bedrockProfile, region: settings.bedrockRegion, modelId: settings.bedrockModelId };
  const hasAI = !!(cfg.profile && cfg.region && cfg.modelId);

  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i));

  async function loadWeek() {
    setLoading(true);
    try {
      const start = days[0];
      const end = endOfDay(days[days.length - 1]);
      const events = await fetchEventsForRange(start, end);
      setWeekEvents(events);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadWeek(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const weekStart = days[0];
  const weekEnd = days[days.length - 1];

  const openTasks = tasks.filter((t) => t.status !== "done");

  const thisWeekTasks = sortTasks(openTasks.filter((t) => {
    if (!t.dueDate) return false;
    const due = parseISO(t.dueDate);
    return (isBefore(due, now) || (due >= weekStart && due <= weekEnd));
  }));

  const thisWeekIssues = issues.filter((i) => {
    if (!i.dueDate) return false;
    const due = parseISO(i.dueDate);
    return (isBefore(due, now) || (due >= weekStart && due <= weekEnd));
  });

  const thisWeekTickets = tickets.filter((t) => {
    if (!t.dueBy) return false;
    const due = parseISO(t.dueBy);
    return (isBefore(due, now) || (due >= weekStart && due <= weekEnd));
  });

  return (
    <div className="px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Week Ahead</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {format(days[0], "MMM d")} – {format(days[days.length - 1], "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAI && (
            <button
              onClick={() => generateNarrative(true)}
              disabled={loadingNarrative || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 disabled:opacity-40 transition-colors"
            >
              {loadingNarrative ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {narrative ? "Refresh" : "AI Overview"}
            </button>
          )}
          <button
            onClick={loadWeek}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* AI narrative — persists across navigation */}
      {loadingNarrative && !narrative && (
        <div className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Generating week overview…</div>
      )}
      {narrative && (
        <section className="border-t border-gray-200 dark:border-gray-700 pt-5">
          <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">
            {narrative.replace(/^#{1,3}\s[^\n]*\n?/gm, "").trim()}
          </div>
          {generatedAt && (
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-600">
              Generated {format(new Date(generatedAt), "EEE MMM d 'at' h:mm a")}
              {loadingNarrative && " · Refreshing…"}
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-5 gap-6 items-start">
        {/* Left: calendar days */}
        <div className="col-span-3 space-y-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500">
            <Calendar size={13} /> Calendar
          </h2>
          {loading && <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading…</p>}
          {days.map((day) => {
            const str = format(day, "yyyy-MM-dd");
            const dayEvents = weekEvents
              .filter((e) => format(new Date(e.start), "yyyy-MM-dd") === str)
              .sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={str}>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-500 mb-2">{format(day, "EEEE, MMM d")}</p>
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-gray-300 dark:text-gray-600 pl-2">No events</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayEvents.map((e) => <MeetingCard key={e.id} event={e} onAddNotes={onAddMeetingNote} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: due this week */}
        <div className="col-span-2 space-y-5">
          {thisWeekTasks.length === 0 && thisWeekIssues.length === 0 && thisWeekTickets.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-600 pt-6 text-center">Nothing due this week.</p>
          )}

          {thisWeekTasks.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
                <CheckSquare size={13} /> Tasks ({thisWeekTasks.length})
              </h2>
              <div className="space-y-1">
                {thisWeekTasks.map((t) => (
                  <TaskItem key={t.id} task={t} onComplete={complete} />
                ))}
              </div>
            </section>
          )}

          {thisWeekIssues.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
                <GitBranch size={13} /> GitLab Items ({thisWeekIssues.length})
              </h2>
              <div className="space-y-1">
                {thisWeekIssues.map((issue) => (
                  <GitLabItemRow key={issue.id} issue={issue} compact />
                ))}
              </div>
            </section>
          )}

          {thisWeekTickets.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
                <Ticket size={13} /> Freshservice Tickets ({thisWeekTickets.length})
              </h2>
              <div className="space-y-1">
                {thisWeekTickets.map((ticket) => (
                  <FreshserviceTicketRow key={ticket.id} ticket={ticket} compact />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

