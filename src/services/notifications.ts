import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { CalendarEvent, Task } from "../types";
import { format, parseISO, isBefore } from "date-fns";

let scheduledTimers: ReturnType<typeof setTimeout>[] = [];

export async function ensureNotificationPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  return granted;
}

export function clearScheduledNotifications() {
  scheduledTimers.forEach(clearTimeout);
  scheduledTimers = [];
}

export async function scheduleMeetingNotifications(events: CalendarEvent[]) {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  clearScheduledNotifications();

  const now = new Date();
  const upcoming = events.filter((e) => parseISO(e.start) > now);

  for (const event of upcoming) {
    const start = parseISO(event.start);
    const msUntil = start.getTime() - now.getTime();
    const msUntil10 = msUntil - 10 * 60 * 1000; // 10 min before
    const msUntil2 = msUntil - 2 * 60 * 1000;   // 2 min before

    if (msUntil10 > 0 && msUntil10 < 8 * 60 * 60 * 1000) {
      scheduledTimers.push(setTimeout(() => {
        sendNotification({
          title: `In 10 minutes: ${event.title}`,
          body: `${format(start, "h:mm a")}${event.teamsLink ? " · Teams meeting" : ""}${event.location ? ` · ${event.location}` : ""}`,
        });
      }, msUntil10));
    }

    if (msUntil2 > 0 && msUntil2 < 8 * 60 * 60 * 1000) {
      scheduledTimers.push(setTimeout(() => {
        sendNotification({
          title: `Starting soon: ${event.title}`,
          body: `${format(start, "h:mm a")}${event.teamsLink ? " · Click to join Teams" : ""}`,
        });
      }, msUntil2));
    }
  }
}

export async function notifyOverdueTasks(tasks: Task[]) {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const now = new Date();
  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.dueDate && isBefore(parseISO(t.dueDate), now)
  );

  if (overdue.length === 0) return;

  sendNotification({
    title: `${overdue.length} overdue task${overdue.length !== 1 ? "s" : ""}`,
    body: overdue.slice(0, 3).map((t) => t.title).join(", ") + (overdue.length > 3 ? "…" : ""),
  });
}
