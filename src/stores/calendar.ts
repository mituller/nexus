import { create } from "zustand";
import { CalendarEvent, DailyBriefing } from "../types";
import { fetchAndParseICalFeed } from "../services/ical";
import { generateDailyBriefing, hasBedrockConfig } from "../services/claude";
import { getCachedBriefing, saveCachedBriefing } from "../services/store";
import { useSettingsStore } from "./settings";
import { useTaskStore } from "./tasks";
import { isToday, startOfDay, endOfDay, addDays, format } from "date-fns";

interface CalendarStore {
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  briefing: DailyBriefing | null;
  loadingEvents: boolean;
  loadingBriefing: boolean;
  connected: boolean;
  lastFetched: Date | null;
  fetchEvents: () => Promise<void>;
  fetchEventsForRange: (start: Date, end: Date) => Promise<CalendarEvent[]>;
  generateBriefing: (force?: boolean) => Promise<void>;
}

function mergeAndSort(events: CalendarEvent[]): CalendarEvent[] {
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

async function fetchAllFeeds(start: Date, end: Date): Promise<CalendarEvent[]> {
  const { settings } = useSettingsStore.getState();
  const enabled = settings.icalFeeds.filter((f) => f.enabled);
  if (enabled.length === 0) return [];

  const results = await Promise.allSettled(
    enabled.map((feed) => fetchAndParseICalFeed(feed, start, end))
  );

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
  lastFetched: null,

  fetchEvents: async () => {
    const { settings } = useSettingsStore.getState();
    const enabled = settings.icalFeeds.filter((f) => f.enabled);
    if (enabled.length === 0) { set({ connected: false }); return; }

    set({ loadingEvents: true });
    try {
      const now = new Date();
      const all = await fetchAllFeeds(startOfDay(now), endOfDay(addDays(now, 1)));

      // Use local date strings — toISOString() gives UTC which is wrong after ~6pm CT
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

  fetchEventsForRange: async (start: Date, end: Date): Promise<CalendarEvent[]> => {
    return mergeAndSort(await fetchAllFeeds(start, end));
  },

  generateBriefing: async (force = false) => {
    if (!force) {
      const cached = await getCachedBriefing();
      if (cached && isToday(new Date(cached.generatedAt))) {
        try {
          const parsed = JSON.parse(cached.briefing) as DailyBriefing;
          // Discard stale briefing: had 0 meetings but we now have events, or was generated over 4 hours ago
          const currentEvents = get().todayEvents;
          const ageHours = (Date.now() - new Date(cached.generatedAt).getTime()) / 3_600_000;
          const stale = (parsed.stats.meetingsToday === 0 && currentEvents.length > 0) || ageHours > 4;
          if (stale) {
            // fall through to regenerate
          } else {
            set({ briefing: parsed });
            return;
          }
        } catch { /* regenerate */ }
      }
    }

    const { settings } = useSettingsStore.getState();
    const cfg = { profile: settings.bedrockProfile, region: settings.bedrockRegion, modelId: settings.bedrockModelId };
    if (!hasBedrockConfig(cfg)) return;

    const { todayEvents, tomorrowEvents } = get();
    const { tasks } = useTaskStore.getState();

    set({ loadingBriefing: true });
    try {
      const briefing = await generateDailyBriefing(
        cfg,
        settings.userName || "there",
        todayEvents,
        tomorrowEvents,
        tasks
      );
      set({ briefing });
      await saveCachedBriefing(JSON.stringify(briefing));
    } catch (e) {
      console.error("Failed to generate briefing:", e);
    } finally {
      set({ loadingBriefing: false });
    }
  },
}));
