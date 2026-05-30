import { CalendarEvent } from "../types";
import { format, parseISO } from "date-fns";

export function buildMeetingNoteTemplate(event: CalendarEvent): { title: string; content: string } {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const dateStr = format(start, "EEEE, MMMM d, yyyy");
  const timeStr = `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;

  const attendeeList = event.attendees.length > 0
    ? event.attendees.map((a) => `- ${a.name}`).join("\n")
    : "- ";

  const content = `**Date:** ${dateStr}
**Time:** ${timeStr}
**Organizer:** ${event.isOrganizer ? "You" : (event.attendees.find((a) => a.response === "accepted")?.name ?? "Unknown")}

## Attendees
${attendeeList}

## Agenda


## Notes


## Decisions


## Action Items

`;

  return { title: event.title, content };
}
