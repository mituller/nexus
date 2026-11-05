import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { CalendarEvent, Task } from "../types";
import {
  clearScheduledNotifications, ensureNotificationPermission, notifyOverdueTasks, scheduleMeetingNotifications,
} from "./notifications";

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(), requestPermission: vi.fn(), sendNotification: vi.fn(),
}));

const MINUTE = 60 * 1000;
const NOW = new Date(2026, 5, 15, 12);

function event(minutesAway: number, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = new Date(NOW.getTime() + minutesAway * MINUTE);
  return {
    id: "e", title: "Planning", start: start.toISOString(), end: start.toISOString(),
    isOrganizer: false, isTentative: false, attendees: [], feedId: "f", feedLabel: "F", color: "c",
    ...overrides,
  };
}

function task(title: string, overrides: Partial<Task> = {}): Task {
  return { id: title, title, status: "open", priority: "low", tags: [], dueDate: "2026-06-01", createdAt: "c", updatedAt: "u", ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(isPermissionGranted).mockResolvedValue(true);
});

afterEach(() => {
  clearScheduledNotifications();
  vi.useRealTimers();
});

describe("ensureNotificationPermission", () => {
  it("doesn't ask again once granted", async () => {
    expect(await ensureNotificationPermission()).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each([["granted", true], ["denied", false]] as const)("asks when needed, and %s means %s", async (answer, expected) => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue(answer);
    expect(await ensureNotificationPermission()).toBe(expected);
  });
});

describe("scheduleMeetingNotifications", () => {
  it("notifies 10 and 2 minutes before a meeting", async () => {
    await scheduleMeetingNotifications([event(30, { teamsLink: "https://teams", location: "Room 1" })]);

    await vi.advanceTimersByTimeAsync(20 * MINUTE - 1);
    expect(sendNotification).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sendNotification).toHaveBeenLastCalledWith({
      title: "In 10 minutes: Planning",
      body: "12:30 PM · Teams meeting · Room 1",
    });

    await vi.advanceTimersByTimeAsync(8 * MINUTE);
    expect(sendNotification).toHaveBeenLastCalledWith({
      title: "Starting soon: Planning",
      body: "12:30 PM · Click to join Teams",
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("leaves out the details a meeting doesn't have", async () => {
    await scheduleMeetingNotifications([event(5)]);
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    expect(sendNotification).toHaveBeenCalledWith({ title: "Starting soon: Planning", body: "12:05 PM" });
  });

  it("skips reminders that have already passed", async () => {
    await scheduleMeetingNotifications([event(5), event(1), event(-30)]);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendNotification).mock.lastCall![0]).toMatchObject({ title: "Starting soon: Planning" });
  });

  it("doesn't schedule meetings more than 8 hours out", async () => {
    await scheduleMeetingNotifications([event(9 * 60)]);
    await vi.advanceTimersByTimeAsync(10 * 60 * MINUTE);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("replaces the previous schedule, so a refresh doesn't notify twice", async () => {
    await scheduleMeetingNotifications([event(30)]);
    await scheduleMeetingNotifications([event(30)]);
    await vi.advanceTimersByTimeAsync(20 * MINUTE);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("cancels reminders when cleared", async () => {
    await scheduleMeetingNotifications([event(30)]);
    clearScheduledNotifications();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing without permission", async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue("denied");
    await scheduleMeetingNotifications([event(30)]);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("notifyOverdueTasks", () => {
  it("summarizes overdue open tasks", async () => {
    await notifyOverdueTasks([task("A"), task("Done", { status: "done" }), task("Later", { dueDate: "2026-07-01" }), task("Undated", { dueDate: undefined })]);
    expect(sendNotification).toHaveBeenCalledWith({ title: "1 overdue task", body: "A" });
  });

  it("names the first three and shortens the rest", async () => {
    await notifyOverdueTasks([task("A"), task("B"), task("C"), task("D")]);
    expect(sendNotification).toHaveBeenCalledWith({ title: "4 overdue tasks", body: "A, B, C…" });
  });

  it("stays quiet when nothing is overdue", async () => {
    await notifyOverdueTasks([task("Later", { dueDate: "2026-07-01" })]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing without permission", async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue("denied");
    await notifyOverdueTasks([task("A")]);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
