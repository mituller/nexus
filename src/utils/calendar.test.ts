import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarEvent } from "../types";
import { formatShortDate, isAllDay, isOverdue } from "./calendar";

function event(start: Date, end: Date): CalendarEvent {
  return {
    id: "e1",
    title: "Event",
    start: start.toISOString(),
    end: end.toISOString(),
    isOrganizer: false,
    isTentative: false,
    attendees: [],
    feedId: "f1",
    feedLabel: "Feed",
    color: "#000",
  };
}

describe("test environment", () => {
  it("runs in a non-UTC timezone", () => {
    expect(new Date(2026, 5, 1).getTimezoneOffset()).toBe(240);
  });
});

describe("isAllDay", () => {
  it("accepts a local-midnight event lasting one day", () => {
    expect(isAllDay(event(new Date(2026, 5, 1), new Date(2026, 5, 2)))).toBe(true);
  });

  it("accepts a local-midnight event lasting several days", () => {
    expect(isAllDay(event(new Date(2026, 5, 1), new Date(2026, 5, 4)))).toBe(true);
  });

  it("rejects midnight in UTC, which is not midnight locally", () => {
    const start = new Date("2026-06-01T00:00:00Z");
    const end = new Date("2026-06-02T00:00:00Z");
    expect(isAllDay(event(start, end))).toBe(false);
  });

  it("rejects a timed event", () => {
    expect(isAllDay(event(new Date(2026, 5, 1, 9), new Date(2026, 5, 1, 10)))).toBe(false);
  });

  it("rejects a midnight event shorter than a day", () => {
    expect(isAllDay(event(new Date(2026, 5, 1), new Date(2026, 5, 1, 12)))).toBe(false);
  });

  it("rejects a zero-length event", () => {
    expect(isAllDay(event(new Date(2026, 5, 1), new Date(2026, 5, 1)))).toBe(false);
  });

  // DST ended in New York on Nov 1, 2026, so that local day lasted 25 hours.
  it("accepts an all-day event on a daylight-saving change day", () => {
    expect(isAllDay(event(new Date(2026, 10, 1), new Date(2026, 10, 2)))).toBe(true);
  });

  it("accepts a multi-day event spanning a daylight-saving change", () => {
    expect(isAllDay(event(new Date(2026, 9, 31), new Date(2026, 10, 3)))).toBe(true);
  });

  it("rejects a local-midnight start with a timed end, whatever the length", () => {
    expect(isAllDay(event(new Date(2026, 5, 1), new Date(2026, 5, 2, 9)))).toBe(false);
  });
});

describe("isOverdue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("compares against the current time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(isOverdue("2026-06-15T11:59:00Z")).toBe(true);
    expect(isOverdue("2026-06-15T12:01:00Z")).toBe(false);
  });
});

describe("formatShortDate", () => {
  it("formats a date-only string on that same local day", () => {
    expect(formatShortDate("2026-06-03")).toBe("Jun 3");
  });

  it("uses the local day for a UTC timestamp near midnight", () => {
    expect(formatShortDate("2026-06-03T01:00:00Z")).toBe("Jun 2");
  });
});
