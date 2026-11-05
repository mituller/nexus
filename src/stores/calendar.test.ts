import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiConfigFromSettings, generateDailyBriefing, hasAIConfig } from "../services/claude";
import { fetchAndParseICalFeed } from "../services/ical";
import { getCachedBriefing, saveCachedBriefing } from "../services/store";
import { CalendarEvent, DailyBriefing, ICalFeed } from "../types";
import { useCalendarStore } from "./calendar";
import { useSettingsStore } from "./settings";

vi.mock("../services/claude");
vi.mock("../services/ical");
vi.mock("../services/store");
vi.mock("./git", () => ({ useGitStore: { getState: () => ({ issues: [] }) } }));

const NOW = new Date(2026, 5, 15, 12);
const MINUTE = 60 * 1000;

function feed(id: string, enabled = true): ICalFeed {
  return { id, label: id, url: `https://example.com/${id}.ics`, color: "#000", enabled };
}

function event(id: string, start: string): CalendarEvent {
  return {
    id, title: id, start, end: start, isOrganizer: false, isTentative: false,
    attendees: [], feedId: "f", feedLabel: "f", color: "#000",
  };
}

function useFeeds(...icalFeeds: ICalFeed[]) {
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getState().settings, icalFeeds },
  });
}

const store = () => useCalendarStore.getState();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  useCalendarStore.setState(useCalendarStore.getInitialState(), true);
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchEvents", () => {
  it("reports disconnected and fetches nothing with no enabled feeds", async () => {
    useFeeds(feed("off", false));
    await store().fetchEvents();
    expect(store().connected).toBe(false);
    expect(fetchAndParseICalFeed).not.toHaveBeenCalled();
  });

  it("buckets events by local date, not UTC date", async () => {
    useFeeds(feed("a"));
    vi.mocked(fetchAndParseICalFeed).mockResolvedValue([
      // 01:00 UTC on the 16th is still the evening of the 15th in New York
      event("tonight", "2026-06-16T01:00:00.000Z"),
      event("tomorrow", "2026-06-16T14:00:00.000Z"),
    ]);
    await store().fetchEvents();
    expect(store().todayEvents.map((e) => e.id)).toEqual(["tonight"]);
    expect(store().tomorrowEvents.map((e) => e.id)).toEqual(["tomorrow"]);
  });

  it("sorts events across feeds by start time", async () => {
    useFeeds(feed("a"), feed("b"));
    vi.mocked(fetchAndParseICalFeed)
      .mockResolvedValueOnce([event("late", "2026-06-15T20:00:00.000Z")])
      .mockResolvedValueOnce([event("early", "2026-06-15T14:00:00.000Z")]);
    await store().fetchEvents();
    expect(store().todayEvents.map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("keeps good feeds and records the reason a bad one failed", async () => {
    useFeeds(feed("good"), feed("bad"));
    vi.mocked(fetchAndParseICalFeed)
      .mockResolvedValueOnce([event("e", "2026-06-15T14:00:00.000Z")])
      .mockRejectedValueOnce(new Error("404"));
    await store().fetchEvents();
    expect(store().todayEvents).toHaveLength(1);
    expect(store().feedStatus).toEqual([
      { label: "good", ok: true, count: 1 },
      { label: "bad", ok: false, count: 0, error: "404" },
    ]);
    expect(store().loadingEvents).toBe(false);
  });
});

describe("range cache", () => {
  const start = new Date(2026, 5, 1);
  const end = new Date(2026, 5, 7);

  beforeEach(() => useFeeds(feed("a")));

  it("reports a miss before anything is fetched", () => {
    expect(store().getCachedRange(start, end)).toBeNull();
  });

  it("fetches on a miss and caches the result", async () => {
    const events = [event("e", "2026-06-02T14:00:00.000Z")];
    vi.mocked(fetchAndParseICalFeed).mockResolvedValue(events);
    expect(await store().fetchEventsForRange(start, end)).toEqual(events);
    expect(store().getCachedRange(start, end)).toEqual(events);
  });

  it("returns fresh cache immediately and refreshes it in the background", async () => {
    vi.mocked(fetchAndParseICalFeed).mockResolvedValueOnce([event("old", "2026-06-02T14:00:00.000Z")]);
    await store().fetchEventsForRange(start, end);

    vi.mocked(fetchAndParseICalFeed).mockResolvedValueOnce([event("new", "2026-06-02T14:00:00.000Z")]);
    const result = await store().fetchEventsForRange(start, end);
    expect(result.map((e) => e.id)).toEqual(["old"]);

    await vi.waitFor(() => {
      expect(store().getCachedRange(start, end)?.map((e) => e.id)).toEqual(["new"]);
    });
  });

  it("waits for new data once the cache is 15 minutes old", async () => {
    vi.mocked(fetchAndParseICalFeed).mockResolvedValueOnce([event("old", "2026-06-02T14:00:00.000Z")]);
    await store().fetchEventsForRange(start, end);

    vi.setSystemTime(NOW.getTime() + 15 * MINUTE);
    vi.mocked(fetchAndParseICalFeed).mockResolvedValueOnce([event("new", "2026-06-02T14:00:00.000Z")]);
    const result = await store().fetchEventsForRange(start, end);
    expect(result.map((e) => e.id)).toEqual(["new"]);
  });

  it("keys the cache by both ends of the range", async () => {
    vi.mocked(fetchAndParseICalFeed).mockResolvedValue([]);
    await store().fetchEventsForRange(start, end);
    expect(store().getCachedRange(start, new Date(2026, 5, 8))).toBeNull();
  });
});

describe("prefetchCurrentWeek", () => {
  it("does nothing without a usable feed", async () => {
    useFeeds({ ...feed("a"), url: "" });
    await store().prefetchCurrentWeek();
    expect(fetchAndParseICalFeed).not.toHaveBeenCalled();
  });

  it("caches Sunday through Saturday, and skips a second fetch while fresh", async () => {
    useFeeds(feed("a"));
    vi.mocked(fetchAndParseICalFeed).mockResolvedValue([]);
    await store().prefetchCurrentWeek();
    await store().prefetchCurrentWeek();
    expect(fetchAndParseICalFeed).toHaveBeenCalledTimes(1);
    // June 15, 2026 is a Monday
    expect(Object.keys(store().rangeCache)).toEqual(["2026-06-14::2026-06-20"]);
  });
});

describe("generateBriefing", () => {
  const briefing = (meetingsToday: number) => ({ stats: { meetingsToday } }) as unknown as DailyBriefing;
  const cachedAt = (date: Date, value: DailyBriefing | string = briefing(1)) => ({
    briefing: typeof value === "string" ? value : JSON.stringify(value),
    generatedAt: date.toISOString(),
  });

  beforeEach(() => {
    vi.mocked(hasAIConfig).mockReturnValue(true);
    vi.mocked(generateDailyBriefing).mockResolvedValue(briefing(9));
    vi.mocked(aiConfigFromSettings).mockReturnValue({} as ReturnType<typeof aiConfigFromSettings>);
  });

  it("uses today's cached briefing when it is recent", async () => {
    vi.mocked(getCachedBriefing).mockResolvedValue(cachedAt(new Date(NOW.getTime() - 60 * MINUTE)));
    await store().generateBriefing();
    expect(store().briefing).toEqual(briefing(1));
    expect(generateDailyBriefing).not.toHaveBeenCalled();
  });

  it("regenerates a briefing older than 4 hours", async () => {
    vi.mocked(getCachedBriefing).mockResolvedValue(cachedAt(new Date(NOW.getTime() - 241 * MINUTE)));
    await store().generateBriefing();
    expect(store().briefing).toEqual(briefing(9));
  });

  it("regenerates a briefing from yesterday", async () => {
    vi.mocked(getCachedBriefing).mockResolvedValue(cachedAt(new Date(2026, 5, 14, 23)));
    await store().generateBriefing();
    expect(generateDailyBriefing).toHaveBeenCalled();
  });

  it("regenerates when the cache saw no meetings but there are some now", async () => {
    vi.mocked(getCachedBriefing).mockResolvedValue(cachedAt(NOW, briefing(0)));
    useCalendarStore.setState({ todayEvents: [event("e", "2026-06-15T14:00:00.000Z")] });
    await store().generateBriefing();
    expect(generateDailyBriefing).toHaveBeenCalled();
  });

  it("regenerates when the cached briefing is corrupt", async () => {
    vi.mocked(getCachedBriefing).mockResolvedValue(cachedAt(NOW, "{not json"));
    await store().generateBriefing();
    expect(store().briefing).toEqual(briefing(9));
  });

  it("ignores the cache when forced, and saves the result", async () => {
    await store().generateBriefing(true);
    expect(getCachedBriefing).not.toHaveBeenCalled();
    expect(saveCachedBriefing).toHaveBeenCalledWith(JSON.stringify(briefing(9)));
  });

  it("does nothing without AI configuration", async () => {
    vi.mocked(hasAIConfig).mockReturnValue(false);
    await store().generateBriefing(true);
    expect(generateDailyBriefing).not.toHaveBeenCalled();
  });

  it("keeps the old briefing and clears the loading flag on failure", async () => {
    useCalendarStore.setState({ briefing: briefing(1) });
    vi.mocked(generateDailyBriefing).mockRejectedValue(new Error("throttled"));
    await store().generateBriefing(true);
    expect(store().briefing).toEqual(briefing(1));
    expect(store().loadingBriefing).toBe(false);
    expect(saveCachedBriefing).not.toHaveBeenCalled();
  });
});
