import { create } from "zustand";
import { CalendarEvent, DailyBriefing } from "../types";
import { fetchAndParseICalFeed } from "../services/ical";
import { generateDailyBriefing, hasBedrockConfig } from "../services/claude";
import { getCachedBriefing, saveCachedBriefing } from "../services/store";
import { useSettingsStore } from "./settings";
import { useTaskStore } from "./tasks";
import { useGitLabStore } from "./gitlab";
import { useFreshserviceStore } from "./freshservice";
import { isToday, startOfDay, endOfDay, addDays, startOfWeek, endOfWeek, format } from "date-fns";

const STALE_MS = 15 * 60 * 1000; // 15 minutes

export interface FeedStatus {
  label: string;
  ok: boolean;
  count: number;      // events returned for the last fetched range
  error?: string;
}

interface CachedRange {
  events: CalendarEvent[];
  fetchedAt: number;
}

interface CalendarStore {
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  briefing: DailyBriefing | null;
  loadingEvents: boolean;
  loadingBriefing: boolean;
  connected: boolean;
  /** Per-feed outcome of the last fetch, so an empty feed is distinguishable from a broken one. */
  feedStatus: FeedStatus[];
  lastFetched: Date | null;
  rangeCache: Record<string, CachedRange>;
  fetchEvents: () => Promise<void>;
  prefetchCurrentWeek: () => Promise<void>;
  fetchEventsForRange: (start: Date, end: Date) => Promise<CalendarEvent[]>;
  getCachedRange: (start: Date, end: Date) => CalendarEvent[] | null;
  generateBriefing: (force?: boolean) => Promise<void>;
}

function rangeKey(start: Date, end: Date): string {
  return `${format(start, "yyyy-MM-dd")}::${format(end, "yyyy-MM-dd")}`;
}

function mergeAndSort(events: CalendarEvent[]): CalendarEvent[] {
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

async function fetchAllFeeds(
  start: Date,
  end: Date,
  onStatus?: (status: FeedStatus[]) => void
): Promise<CalendarEvent[]> {
  const { settings } = useSettingsStore.getState();
  const enabled = settings.icalFeeds.filter((f) => f.enabled);
  if (enabled.length === 0) { onStatus?.([]); return []; }

  const results = await Promise.allSettled(
    enabled.map((feed) => fetchAndParseICalFeed(feed, start, end))
  );

  // Record why each feed produced what it did — a feed that fails is otherwise
  // indistinguishable from one that simply has no events in the range.
  onStatus?.(results.map((r, i) => r.status === "fulfilled"
    ? { label: enabled[i].label, ok: true, count: r.value.length }
    : { label: enabled[i].label, ok: false, count: 0, error: String(r.reason?.message ?? r.reason) }));

  return results
    .filter((r): r is PromiseFulfilledResult<CalendarEvent[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  todayEvents: [],
  tomorrowEvents: [],
  briefing: null,
  loadingEvents: false,
  loadingBriefing: false,
  connected: false,
  feedStatus: [],
  lastFetched: null,
  rangeCache: {},

  fetchEvents: async () => {
    const { settings } = useSettingsStore.getState();
    const enabled = settings.icalFeeds.filter((f) => f.enabled);
    if (enabled.length === 0) { set({ connected: false }); return; }

    set({ loadingEvents: true });
    try {
      const now = new Date();
      const all = await fetchAllFeeds(startOfDay(now), endOfDay(addDays(now, 1)), (feedStatus) => set({ feedStatus }));

      const todayStr = format(now, "yyyy-MM-dd");
      const tomorrowStr = format(addDays(now, 1), "yyyy-MM-dd");
      const localDate = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

      set({
        todayEvents: mergeAndSort(all.filter((e) => localDate(e.start) === todayStr)),
        tomorrowEvents: mergeAndSort(all.filter((e) => localDate(e.start) === tomorrowStr)),
        connected: true,
        lastFetched: new Date(),
      });
    } catch (e) {
      console.error("Failed to fetch calendar events:", e);
    } finally {
      set({ loadingEvents: false });
    }
  },

  // Pre-fetch the full current week in the background at startup
  prefetchCurrentWeek: async () => {
    const { settings } = useSettingsStore.getState();
    if (!settings.icalFeeds.some((f) => f.enabled && f.url)) return;

    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 0 });
    const end = endOfWeek(now, { weekStartsOn: 0 });
    const key = rangeKey(start, end);
    const cached = get().rangeCache[key];

    // Skip if already fresh
    if (cached && Date.now() - cached.fetchedAt < STALE_MS) return;

    try {
      const events = mergeAndSort(await fetchAllFeeds(start, end));
      set((state) => ({
        rangeCache: { ...state.rangeCache, [key]: { events, fetchedAt: Date.now() } },
        connected: true,
      }));
    } catch (e) {
      console.error("Failed to prefetch current week:", e);
    }
  },

  // Returns cached events instantly if fresh; always fetches in background if stale/missing
  fetchEventsForRange: async (start: Date, end: Date): Promise<CalendarEvent[]> => {
    const key = rangeKey(start, end);
    const cached = get().rangeCache[key];
    const fresh = cached && Date.now() - cached.fetchedAt < STALE_MS;

    if (fresh) {
      // Return cached immediately; silently refresh in background for next call
      setTimeout(async () => {
        try {
          const events = mergeAndSort(await fetchAllFeeds(start, end, (feedStatus) => set({ feedStatus })));
          set((state) => ({
            rangeCache: { ...state.rangeCache, [key]: { events, fetchedAt: Date.now() } },
          }));
        } catch { /* ignore background refresh errors */ }
      }, 0);
      return cached.events;
    }

    // No fresh cache — fetch now
    const events = mergeAndSort(await fetchAllFeeds(start, end, (feedStatus) => set({ feedStatus })));
    set((state) => ({
      rangeCache: { ...state.rangeCache, [key]: { events, fetchedAt: Date.now() } },
      connected: true,
    }));
    return events;
  },

  // Synchronous cache lookup — used by CalendarView for instant display
  getCachedRange: (start: Date, end: Date): CalendarEvent[] | null => {
    const cached = get().rangeCache[rangeKey(start, end)];
    return cached ? cached.events : null;
  },

  generateBriefing: async (force = false) => {
    if (!force) {
      const cached = await getCachedBriefing();
      if (cached && isToday(new Date(cached.generatedAt))) {
        try {
          const parsed = JSON.parse(cached.briefing) as DailyBriefing;
          const currentEvents = get().todayEvents;
          const ageHours = (Date.now() - new Date(cached.generatedAt).getTime()) / 3_600_000;
          const stale = (parsed.stats.meetingsToday === 0 && currentEvents.length > 0) || ageHours > 4;
          if (!stale) { set({ briefing: parsed }); return; }
        } catch { /* regenerate */ }
      }
    }

    const { settings } = useSettingsStore.getState();
    const cfg = { profile: settings.bedrockProfile, region: settings.bedrockRegion, modelId: settings.bedrockModelId };
    if (!hasBedrockConfig(cfg)) return;

    const { todayEvents, tomorrowEvents } = get();
    const { tasks } = useTaskStore.getState();
    const { issues } = useGitLabStore.getState();
    const { tickets } = useFreshserviceStore.getState();

    set({ loadingBriefing: true });
    try {
      const briefing = await generateDailyBriefing(cfg, settings.userName || "there", todayEvents, tomorrowEvents, tasks, issues, tickets);
      set({ briefing });
      await saveCachedBriefing(JSON.stringify(briefing));
    } catch (e) {
      console.error("Failed to generate briefing:", e);
    } finally {
      set({ loadingBriefing: false });
    }
  },
}));
