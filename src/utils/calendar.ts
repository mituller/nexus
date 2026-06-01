import { format, parseISO, isBefore } from "date-fns";
import { CalendarEvent } from "../types";

/** True for all-day events (starts at local midnight, duration is a whole-day multiple) */
export function isAllDay(event: CalendarEvent): boolean {
  const s = new Date(event.start);
  const ms = new Date(event.end).getTime() - s.getTime();
  return s.getHours() === 0 && s.getMinutes() === 0 && s.getSeconds() === 0
    && ms > 0 && ms % (24 * 60 * 60 * 1000) === 0;
}

/** True if an ISO date string is in the past */
export function isOverdue(isoDate: string): boolean {
  return isBefore(parseISO(isoDate), new Date());
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
