import { useState, useEffect, useMemo } from "react";
import { RefreshCw, Calendar, CheckSquare } from "lucide-react";
import { format, addDays, isBefore, parseISO } from "date-fns";
import { useCalendarStore } from "../../stores/calendar";
import { useSettingsStore } from "../../stores/settings";
import { useTaskStore } from "../../stores/tasks";
import { useGitLabStore } from "../../stores/gitlab";
import { useFreshserviceStore } from "../../stores/freshservice";
import { StatsBar } from "./StatsBar";
import { HeadsUpSection } from "./HeadsUpSection";
import { MeetingCard } from "./MeetingCard";
import { DashboardTaskItem } from "./DashboardTaskItem";
import { sortTasks } from "../ui/TaskItem";
import { GitLabSection } from "./GitLabSection";
import { FreshserviceSection } from "./FreshserviceSection";

export function Dashboard() {
  const { settings } = useSettingsStore();
  const { tasks, complete } = useTaskStore();
  const {
    todayEvents, tomorrowEvents, briefing,
    loadingEvents, loadingBriefing, connected, lastFetched,
    fetchEvents, generateBriefing,
  } = useCalendarStore();
  const { fetch: fetchGitLab, issues } = useGitLabStore();
  const { fetch: fetchTickets, tickets } = useFreshserviceStore();

  // Live clock — updates every minute so greeting and time stay current
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fetch on mount if data is missing or stale (> 10 min old)
  useEffect(() => {
    const stale = !lastFetched || (Date.now() - lastFetched.getTime()) > 10 * 60_000;
    if (hasFeeds && stale && !loadingEvents) {
      fetchEvents().then(() => generateBriefing());
      fetchGitLab();
      fetchTickets();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const h = now.getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = settings.userName || "there";
  const hasFeeds = settings.icalFeeds.some((f) => f.enabled && f.url);
  const openTasks = useMemo(() => sortTasks(tasks.filter((t) => t.status !== "done")), [tasks]);

  // #8 — count overdue GitLab items + Freshservice tickets for stats bar
  const overdueExternal = useMemo(() => {
    const today = new Date();
    const overdueIssues = issues.filter((i) => i.dueDate && isBefore(parseISO(i.dueDate), today)).length;
    const overdueTickets = tickets.filter((t) => t.dueBy && isBefore(parseISO(t.dueBy), today)).length;
    return overdueIssues + overdueTickets;
  }, [issues, tickets]);

  // #5 — Refresh all sources at once
  async function handleRefresh() {
    await Promise.all([fetchEvents(), fetchGitLab(), fetchTickets()]);
    await generateBriefing(true);
  }

  return (
    <div className="px-8 py-6 space-y-5 min-h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{greeting}, {name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">
            {format(now, "EEEE, MMMM d")} · {format(now, "h:mm a")}
            {lastFetched && (
              <span className="ml-2 text-gray-400 dark:text-gray-500">
                · Calendar updated {format(lastFetched, "h:mm a")}
              </span>
            )}
            {loadingEvents && <span className="ml-2 text-blue-400 animate-pulse">· Fetching…</span>}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loadingEvents || loadingBriefing}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={14} className={(loadingEvents || loadingBriefing) ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {!hasFeeds && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-purple-800">
          No calendars added yet. Go to <strong>Settings → Calendars</strong> and paste your Outlook or Google iCal URL.
        </div>
      )}

      {/* Loading skeleton while events fetch */}
      {loadingEvents && (
        <div className="space-y-2 animate-pulse">
          <div className="h-20 bg-gray-100 dark:bg-gray-700 rounded-lg" />
          <div className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg" />
          <div className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg" />
        </div>
      )}

      {hasFeeds && !connected && !loadingEvents && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          Could not load calendar feeds — check your iCal URLs in <strong>Settings</strong> or hit Refresh.
        </div>
      )}

      {/* Stats bar */}
      {briefing && !loadingEvents && <StatsBar stats={briefing.stats} overdueExternal={overdueExternal} />}

      {/* Heads Up — full width */}
      {briefing && briefing.headsUp.length > 0 && (
        <HeadsUpSection items={briefing.headsUp} />
      )}

      {/* Two-column body */}
      <div className="grid grid-cols-5 gap-6 items-start">

        {/* Left column — meetings (3/5 width) */}
        <div className="col-span-3 space-y-5">

          {todayEvents.length > 0 && (
            <section>
              <SectionHeader icon={<Calendar size={13} />}>
                Today's Meetings — {format(now, "MMMM d")}
              </SectionHeader>
              <div className="space-y-2">
                {todayEvents.map((e) => <MeetingCard key={e.id} event={e} />)}
              </div>
            </section>
          )}

          {tomorrowEvents.length > 0 && (
            <section>
              <SectionHeader icon={<Calendar size={13} />}>
                Tomorrow — {format(addDays(now, 1), "EEEE MMMM d")}
              </SectionHeader>
              <div className="space-y-2">
                {tomorrowEvents.map((e) => <MeetingCard key={e.id} event={e} />)}
              </div>
            </section>
          )}

          {/* Narrative */}
          {briefing?.narrative && (
            <section className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">A few things worth calling out:</h2>
              <div className="text-sm text-gray-600 dark:text-gray-500 leading-relaxed whitespace-pre-line">
                {briefing.narrative}
              </div>
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                Generated {format(new Date(briefing.generatedAt), "h:mm a")}
                {loadingBriefing && " · Refreshing…"}
              </p>
            </section>
          )}

          {loadingBriefing && !briefing && (
            <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Generating your briefing…</p>
          )}
        </div>

        {/* Right column — tasks + GitLab (2/5 width) */}
        <div className="col-span-2 space-y-5">

          {openTasks.length > 0 && (
            <section>
              <SectionHeader icon={<CheckSquare size={13} />}>
                Open Tasks
              </SectionHeader>
              <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                {openTasks.slice(0, 8).map((t) => <DashboardTaskItem key={t.id} task={t} onComplete={complete} />)}
              </div>
            </section>
          )}

          <GitLabSection />
          <FreshserviceSection />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
      {icon}
      {children}
    </h2>
  );
}
