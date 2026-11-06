import { format, parseISO, isBefore, endOfDay } from "date-fns";
import { CalendarEvent } from "../types";

/**
 * True for all-day events (starts and ends at local midnight). Checks the end's
 * clock time, not the duration, because daylight-saving days aren't 24 hours long.
 */
export function isAllDay(event: CalendarEvent): boolean {
  const s = new Date(event.start);
  const e = new Date(event.end);
  const atMidnight = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
  return atMidnight(s) && atMidnight(e) && e.getTime() > s.getTime();
}

/** True if a due date has passed. A date with no time stays due until that day ends. */
export function isOverdue(isoDate: string): boolean {
  const due = parseISO(isoDate);
  return isBefore(isoDate.length === 10 ? endOfDay(due) : due, new Date());
}

/** Format an ISO date string as "MMM d" (e.g. "Jun 3") */
export function formatShortDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMM d");
}

/** Open a URL in the system browser */
export async function openExternalUrl(url: string): Promise<void> {
  const { open } = await import("@tauri-apps/plugin-shell");
  return open(url);
}
