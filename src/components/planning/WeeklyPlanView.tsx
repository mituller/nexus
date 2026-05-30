import { useState, useEffect } from "react";
import { RefreshCw, Calendar, CheckSquare, GitBranch, Sparkles } from "lucide-react";
import { format, startOfDay, endOfDay, addDays, parseISO, isBefore } from "date-fns";
import { useCalendarStore } from "../../stores/calendar";
import { useTaskStore } from "../../stores/tasks";
import { useGitLabStore } from "../../stores/gitlab";
import { useSettingsStore } from "../../stores/settings";
import { MeetingCard } from "../dashboard/MeetingCard";
import { callClaude } from "../../services/bedrock";
import { CalendarEvent } from "../../types";

export function WeeklyPlanView() {
  const { settings } = useSettingsStore();
  const { fetchEventsForRange } = useCalendarStore();
  const { tasks } = useTaskStore();
  const { issues, mrs } = useGitLabStore();

  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingNarrative, setLoadingNarrative] = useState(false);

  const cfg = { profile: settings.bedrockProfile, region: settings.bedrockRegion, modelId: settings.bedrockModelId };
  const hasAI = !!(cfg.profile && cfg.region && cfg.modelId);

  const now = new Date();
  // Show Mon–Sun of next 7 days
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i + 1));

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

  async function generateNarrative() {
    if (!hasAI) return;
    setLoadingNarrative(true);
    try {
      const openTasks = tasks.filter((t) => t.status !== "done");
      const overdueCount = openTasks.filter((t) => t.dueDate && isBefore(parseISO(t.dueDate), now)).length;

      const eventsByDay = days.map((day) => {
        const str = format(day, "yyyy-MM-dd");
        const dayEvents = weekEvents.filter((e) => format(new Date(e.start), "yyyy-MM-dd") === str);
        return `${format(day, "EEE MMM d")}: ${dayEvents.length === 0 ? "Clear" : dayEvents.map((e) => `${e.title} (${format(parseISO(e.start), "h:mm a")})`).join(", ")}`;
      }).join("\n");

      const prompt = `You are a weekly planning assistant. Write a concise week-ahead briefing for ${settings.userName || "the user"}. Today is ${format(now, "EEEE, MMMM d, yyyy")}.

NEXT 7 DAYS:
${eventsByDay}

OPEN TASKS: ${openTasks.length} total, ${overdueCount} overdue
TOP TASKS: ${openTasks.slice(0, 5).map((t) => `${t.title} [${t.priority}]`).join(", ")}

GITLAB: ${issues.length} open issues, ${mrs.length} open MRs

Write 3-4 paragraphs covering: the busiest/lightest days, priorities to tackle, any scheduling conflicts or prep needed. Do NOT start with a greeting. Flowing prose, no bullet points.`;

      const result = await callClaude(cfg, [{ role: "user", content: prompt }], 1024);
      setNarrative(result);
    } finally {
      setLoadingNarrative(false);
    }
  }

  useEffect(() => { loadWeek(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openTasks = tasks.filter((t) => t.status !== "done");
  const thisWeekTasks = openTasks.filter((t) => {
    if (!t.dueDate) return false;
    const due = parseISO(t.dueDate);
    return due >= days[0] && due <= days[days.length - 1];
  });

  return (
    <div className="px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Week Ahead</h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">
            {format(days[0], "MMM d")} – {format(days[days.length - 1], "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAI && (
            <button
              onClick={generateNarrative}
              disabled={loadingNarrative || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-40 transition-colors"
            >
              {loadingNarrative ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
              AI Overview
            </button>
          )}
          <button
            onClick={loadWeek}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300 disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* AI narrative */}
      {narrative && (
        <div className="bg-purple-50 border border-purple-100 rounded-lg px-5 py-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
          {narrative}
        </div>
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
                  <p className="text-xs text-gray-300 pl-2">No events</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayEvents.map((e) => <MeetingCard key={e.id} event={e} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: tasks + gitlab */}
        <div className="col-span-2 space-y-6">
          {thisWeekTasks.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
                <CheckSquare size={13} /> Due This Week ({thisWeekTasks.length})
              </h2>
              <div className="space-y-1">
                {thisWeekTasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">
                    <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${t.priority === "high" ? "bg-red-400" : t.priority === "medium" ? "bg-orange-400" : "bg-gray-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 dark:text-gray-100 truncate">{t.title}</p>
                      {t.dueDate && <p className="text-xs text-gray-400 dark:text-gray-500">Due {format(parseISO(t.dueDate), "EEE MMM d")}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(issues.length > 0 || mrs.length > 0) && (
            <section>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
                <GitBranch size={13} /> GitLab
              </h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-500">Open issues</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{issues.length}</span>
                </div>
                <div className="flex justify-between px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-500">Open MRs</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{mrs.length}</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
