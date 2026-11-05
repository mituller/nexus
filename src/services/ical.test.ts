import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { format } from "date-fns";
import { ICalFeed } from "../types";
import { isAllDay } from "../utils/calendar";
import { fetchAndParseICalFeed } from "./ical";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

const feed: ICalFeed = { id: "f1", label: "Work", url: "https://example.com/cal.ics", color: "#123", enabled: true };

// All of June 2026, local time
const rangeStart = new Date(2026, 5, 1);
const rangeEnd = new Date(2026, 5, 30, 23, 59, 59);

function calendar(...blocks: string[][]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...blocks.flat(), "END:VCALENDAR"].join("\r\n");
}

function veventWithUid(uid: string, ...props: string[]): string[] {
  return ["BEGIN:VEVENT", `UID:${uid}`, ...props, "END:VEVENT"];
}

function vevent(...props: string[]): string[] {
  return veventWithUid("uid-1", "SUMMARY:Standup", ...props);
}

function respondWith(text: string) {
  vi.mocked(fetch).mockResolvedValue(new Response(text));
}

async function parse(...blocks: string[][]) {
  respondWith(calendar(...blocks));
  return fetchAndParseICalFeed(feed, rangeStart, rangeEnd);
}

const TIMED = ["DTSTART:20260610T130000Z", "DTEND:20260610T140000Z"];

describe("fetchAndParseICalFeed", () => {
  it("requests the feed URL", async () => {
    await parse(vevent(...TIMED));
    expect(fetch).toHaveBeenCalledWith(feed.url, expect.objectContaining({ headers: expect.any(Object) }));
  });

  it("names the feed when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(fetchAndParseICalFeed(feed, rangeStart, rangeEnd)).rejects.toThrow('"Work": 404');
  });

  it("rejects text that is not iCal", async () => {
    respondWith("<html>sign in</html>");
    await expect(fetchAndParseICalFeed(feed, rangeStart, rangeEnd)).rejects.toThrow();
  });

  it("returns nothing for a calendar with no events", async () => {
    expect(await parse()).toEqual([]);
  });
});

describe("event mapping", () => {
  it("maps core fields and carries the feed's identity", async () => {
    const [e] = await parse(vevent(...TIMED, "LOCATION:Room 1"));
    expect(e).toMatchObject({
      id: "f1_uid-1_2026-06-10T13:00:00.000Z",
      title: "Standup",
      start: "2026-06-10T13:00:00.000Z",
      end: "2026-06-10T14:00:00.000Z",
      location: "Room 1",
      isTentative: false,
      feedId: "f1",
      feedLabel: "Work",
      color: "#123",
    });
  });

  it("converts TZID times using the feed's VTIMEZONE", async () => {
    const [e] = await parse(
      [
        "BEGIN:VTIMEZONE",
        "TZID:Pacific Standard Time",
        "BEGIN:STANDARD",
        "DTSTART:16010101T020000",
        "TZOFFSETFROM:-0700",
        "TZOFFSETTO:-0800",
        "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
        "END:STANDARD",
        "BEGIN:DAYLIGHT",
        "DTSTART:16010101T020000",
        "TZOFFSETFROM:-0800",
        "TZOFFSETTO:-0700",
        "RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
        "END:DAYLIGHT",
        "END:VTIMEZONE",
      ],
      vevent("DTSTART;TZID=Pacific Standard Time:20260610T090000", "DTEND;TZID=Pacific Standard Time:20260610T100000"),
    );
    expect(e.start).toBe("2026-06-10T16:00:00.000Z");
    expect(e.end).toBe("2026-06-10T17:00:00.000Z");
  });

  it("keeps a DATE-only event on its calendar day and all-day", async () => {
    const [e] = await parse(vevent("DTSTART;VALUE=DATE:20260610", "DTEND;VALUE=DATE:20260611"));
    expect(format(new Date(e.start), "yyyy-MM-dd")).toBe("2026-06-10");
    expect(isAllDay(e)).toBe(true);
  });

  it("maps attendees and their responses", async () => {
    const [e] = await parse(vevent(
      ...TIMED,
      "ATTENDEE;CN=Ann;PARTSTAT=ACCEPTED:mailto:ann@example.com",
      "ATTENDEE;PARTSTAT=DECLINED:MAILTO:bob@example.com",
      "ATTENDEE;CN=Cy;PARTSTAT=TENTATIVE:mailto:cy@example.com",
      "ATTENDEE;CN=Di;PARTSTAT=NEEDS-ACTION:mailto:di@example.com",
    ));
    expect(e.attendees).toEqual([
      { name: "Ann", email: "ann@example.com", response: "accepted" },
      { name: "bob@example.com", email: "bob@example.com", response: "declined" },
      { name: "Cy", email: "cy@example.com", response: "tentative" },
      { name: "Di", email: "di@example.com", response: "none" },
    ]);
  });

  it("flags tentative events", async () => {
    const [e] = await parse(vevent(...TIMED, "STATUS:TENTATIVE"));
    expect(e.isTentative).toBe(true);
  });

  it("extracts a Teams link from the description", async () => {
    const link = "https://teams.microsoft.com/l/meetup-join/abc123";
    const [e] = await parse(vevent(...TIMED, `DESCRIPTION:Join here ${link} today`));
    expect(e.teamsLink).toBe(link);
  });

  it("flattens and truncates the body preview", async () => {
    const [e] = await parse(vevent(...TIMED, `DESCRIPTION:line one\\nline two ${"x".repeat(100)}`));
    expect(e.bodyPreview).toHaveLength(80);
    expect(e.bodyPreview?.startsWith("line one line two")).toBe(true);
  });

  it("leaves optional fields undefined when absent", async () => {
    const [e] = await parse(vevent(...TIMED));
    expect(e.location).toBeUndefined();
    expect(e.description).toBeUndefined();
    expect(e.teamsLink).toBeUndefined();
    expect(e.attendees).toEqual([]);
  });

  it("marks an organizer with no attendees as the organizer", async () => {
    const [e] = await parse(vevent(...TIMED, "ORGANIZER:mailto:ann@example.com"));
    expect(e.isOrganizer).toBe(true);
  });
});

describe("range filtering", () => {
  it("excludes events entirely before or after the range", async () => {
    const events = await parse(
      vevent("DTSTART:20260510T130000Z", "DTEND:20260510T140000Z"),
      vevent("DTSTART:20260710T130000Z", "DTEND:20260710T140000Z"),
    );
    expect(events).toEqual([]);
  });

  it("includes an event that began before the range and is still running", async () => {
    const events = await parse(vevent("DTSTART:20260530T130000Z", "DTEND:20260602T130000Z"));
    expect(events).toHaveLength(1);
  });

  it("matches all-day events to the range by local date", async () => {
    respondWith(calendar(
      vevent("DTSTART;VALUE=DATE:20260531", "DTEND;VALUE=DATE:20260601"),
      vevent("DTSTART;VALUE=DATE:20260601", "DTEND;VALUE=DATE:20260602"),
      vevent("DTSTART;VALUE=DATE:20260602", "DTEND;VALUE=DATE:20260603"),
    ));
    const events = await fetchAndParseICalFeed(feed, new Date(2026, 5, 1), new Date(2026, 5, 1, 23, 59, 59));
    expect(events.map((e) => format(new Date(e.start), "yyyy-MM-dd"))).toEqual(["2026-06-01"]);
  });
});

describe("recurring events", () => {
  it("expands only the occurrences inside the range", async () => {
    const events = await parse(vevent(
      "DTSTART:20260525T130000Z",
      "DTEND:20260525T140000Z",
      "RRULE:FREQ=WEEKLY;COUNT=4",
    ));
    expect(events.map((e) => e.start)).toEqual([
      "2026-06-01T13:00:00.000Z",
      "2026-06-08T13:00:00.000Z",
      "2026-06-15T13:00:00.000Z",
    ]);
  });

  it("includes an occurrence that began before the range and is still running", async () => {
    const events = await parse(vevent(
      "DTSTART;VALUE=DATE:20260529",
      "DTEND;VALUE=DATE:20260602",
      "RRULE:FREQ=WEEKLY;COUNT=2",
    ));
    expect(events.map((e) => format(new Date(e.start), "yyyy-MM-dd"))).toEqual(["2026-05-29", "2026-06-05"]);
  });

  it("excludes an occurrence that ended exactly as the range began", async () => {
    const events = await parse(vevent(
      "DTSTART;VALUE=DATE:20260531",
      "DTEND;VALUE=DATE:20260601",
      "RRULE:FREQ=WEEKLY;COUNT=2",
    ));
    expect(events.map((e) => format(new Date(e.start), "yyyy-MM-dd"))).toEqual(["2026-06-07"]);
  });

  it("gives each occurrence a unique id and its own end time", async () => {
    const events = await parse(vevent(
      "DTSTART:20260601T130000Z",
      "DTEND:20260601T140000Z",
      "RRULE:FREQ=DAILY;COUNT=2",
    ));
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
    expect(events[1].end).toBe("2026-06-02T14:00:00.000Z");
  });

  it("skips dates listed in EXDATE", async () => {
    const events = await parse(vevent(
      "DTSTART:20260601T130000Z",
      "DTEND:20260601T140000Z",
      "RRULE:FREQ=DAILY;COUNT=3",
      "EXDATE:20260602T130000Z",
    ));
    expect(events.map((e) => e.start)).toEqual([
      "2026-06-01T13:00:00.000Z",
      "2026-06-03T13:00:00.000Z",
    ]);
  });

  it("includes a recurring all-day event on the first day of the range", async () => {
    const events = await parse(vevent(
      "DTSTART;VALUE=DATE:20260601",
      "DTEND;VALUE=DATE:20260602",
      "RRULE:FREQ=WEEKLY;COUNT=2",
    ));
    expect(events.map((e) => format(new Date(e.start), "yyyy-MM-dd"))).toEqual(["2026-06-01", "2026-06-08"]);
  });

  it("keeps showing a daily series that started long before the range", async () => {
    const events = await parse(vevent(
      "DTSTART:20250101T130000Z",
      "DTEND:20250101T140000Z",
      "RRULE:FREQ=DAILY",
    ));
    expect(events).toHaveLength(30);
  });

  it("shows a rescheduled occurrence once, at its new time", async () => {
    const events = await parse(
      vevent("DTSTART:20260601T130000Z", "DTEND:20260601T140000Z", "RRULE:FREQ=DAILY;COUNT=2"),
      vevent("RECURRENCE-ID:20260602T130000Z", "DTSTART:20260602T180000Z", "DTEND:20260602T190000Z"),
    );
    expect(events.map((e) => e.start).sort()).toEqual([
      "2026-06-01T13:00:00.000Z",
      "2026-06-02T18:00:00.000Z",
    ]);
  });

  it("uses the rescheduled occurrence's own details", async () => {
    const events = await parse(
      vevent("DTSTART:20260601T130000Z", "DTEND:20260601T140000Z", "RRULE:FREQ=DAILY;COUNT=1"),
      veventWithUid(
        "uid-1",
        "SUMMARY:Moved standup",
        "RECURRENCE-ID:20260601T130000Z",
        "DTSTART:20260601T180000Z",
        "DTEND:20260601T190000Z",
      ),
    );
    expect(events.map((e) => e.title)).toEqual(["Moved standup"]);
  });

  it("shows an occurrence moved into the range from outside it", async () => {
    const events = await parse(
      vevent("DTSTART:20260525T130000Z", "DTEND:20260525T140000Z", "RRULE:FREQ=DAILY;COUNT=1"),
      vevent("RECURRENCE-ID:20260525T130000Z", "DTSTART:20260602T130000Z", "DTEND:20260602T140000Z"),
    );
    expect(events.map((e) => e.start)).toEqual(["2026-06-02T13:00:00.000Z"]);
  });

  it("hides an occurrence moved out of the range", async () => {
    const events = await parse(
      vevent("DTSTART:20260602T130000Z", "DTEND:20260602T140000Z", "RRULE:FREQ=DAILY;COUNT=1"),
      vevent("RECURRENCE-ID:20260602T130000Z", "DTSTART:20260702T130000Z", "DTEND:20260702T140000Z"),
    );
    expect(events).toEqual([]);
  });

  it("shifts later occurrences for a this-and-future reschedule", async () => {
    const events = await parse(
      vevent("DTSTART:20260601T130000Z", "DTEND:20260601T140000Z", "RRULE:FREQ=DAILY;COUNT=3"),
      vevent(
        "RECURRENCE-ID;RANGE=THISANDFUTURE:20260602T130000Z",
        "DTSTART:20260602T150000Z",
        "DTEND:20260602T160000Z",
      ),
    );
    expect(events.map((e) => e.start).sort()).toEqual([
      "2026-06-01T13:00:00.000Z",
      "2026-06-02T15:00:00.000Z",
      "2026-06-03T15:00:00.000Z",
    ]);
  });

  it("does not let one series' reschedule affect another at the same time", async () => {
    const events = await parse(
      veventWithUid("a", "SUMMARY:A", "DTSTART:20260602T130000Z", "DTEND:20260602T140000Z", "RRULE:FREQ=DAILY;COUNT=1"),
      veventWithUid("b", "SUMMARY:B", "DTSTART:20260602T130000Z", "DTEND:20260602T140000Z", "RRULE:FREQ=DAILY;COUNT=1"),
      veventWithUid("a", "SUMMARY:A", "RECURRENCE-ID:20260602T130000Z", "DTSTART:20260602T180000Z", "DTEND:20260602T190000Z"),
    );
    expect(events.map((e) => [e.title, e.start]).sort()).toEqual([
      ["A", "2026-06-02T18:00:00.000Z"],
      ["B", "2026-06-02T13:00:00.000Z"],
    ]);
  });

  it("shows a reschedule whose series is not in the feed", async () => {
    const events = await parse(
      vevent("RECURRENCE-ID:20260602T130000Z", "DTSTART:20260602T180000Z", "DTEND:20260602T190000Z"),
    );
    expect(events.map((e) => e.start)).toEqual(["2026-06-02T18:00:00.000Z"]);
  });
});

describe("in a timezone east of UTC", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "Asia/Tokyo";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  const localDates = (events: { start: string }[]) => events.map((e) => format(new Date(e.start), "yyyy-MM-dd"));

  it("runs in Tokyo time", () => {
    expect(new Date(2026, 5, 1).getTimezoneOffset()).toBe(-540);
  });

  it("matches all-day events to the range by local date", async () => {
    respondWith(calendar(
      vevent("DTSTART;VALUE=DATE:20260531", "DTEND;VALUE=DATE:20260601"),
      vevent("DTSTART;VALUE=DATE:20260601", "DTEND;VALUE=DATE:20260602"),
      vevent("DTSTART;VALUE=DATE:20260602", "DTEND;VALUE=DATE:20260603"),
    ));
    const events = await fetchAndParseICalFeed(feed, new Date(2026, 5, 1), new Date(2026, 5, 1, 23, 59, 59));
    expect(localDates(events)).toEqual(["2026-06-01"]);
    expect(isAllDay(events[0])).toBe(true);
  });

  it("matches recurring all-day events to the range by local date", async () => {
    respondWith(calendar(vevent(
      "DTSTART;VALUE=DATE:20260531",
      "DTEND;VALUE=DATE:20260601",
      "RRULE:FREQ=DAILY;COUNT=3",
    )));
    const events = await fetchAndParseICalFeed(feed, new Date(2026, 5, 1), new Date(2026, 5, 1, 23, 59, 59));
    expect(localDates(events)).toEqual(["2026-06-01"]);
  });
});
