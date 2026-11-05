import ICAL from "ical.js";
import { fetch } from "@tauri-apps/plugin-http";
import { CalendarEvent, Attendee, ICalFeed } from "../types";

const MAX_OCCURRENCES_SCANNED = 50_000;

export async function fetchAndParseICalFeed(
  feed: ICalFeed,
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "Nexus/1.0 (calendar client)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch calendar feed "${feed.label}": ${res.status}`);
  const text = await res.text();
  return parseICalText(text, feed, start, end);
}

function parseICalText(
  icsText: string,
  feed: ICalFeed,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const jcalData = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents("vevent");

  // ICAL.Event would otherwise relate every RECURRENCE-ID in the feed to every
  // series, moving occurrences of unrelated series that share a start time.
  const exceptionsByUid = new Map<string, ICAL.Component[]>();
  for (const vevent of vevents) {
    if (!vevent.hasProperty("recurrence-id")) continue;
    const uid = vevent.getFirstPropertyValue("uid") as string;
    exceptionsByUid.set(uid, [...(exceptionsByUid.get(uid) ?? []), vevent]);
  }

  // Compare as JS dates: a DATE value has no timezone, and ICAL.Time.compare
  // would read it as midnight UTC rather than local midnight.
  const start = rangeStart.getTime();
  const end = rangeEnd.getTime();

  const events: CalendarEvent[] = [];

  for (const vevent of vevents) {
    const isException = vevent.hasProperty("recurrence-id");
    const uid = vevent.getFirstPropertyValue("uid") as string;
    const event = new ICAL.Event(vevent, {
      exceptions: isException ? [] : exceptionsByUid.get(uid) ?? [],
    });

    try {
      if (event.isRecurring()) {
        const iter = event.iterator();
        let next: ICAL.Time | null;
        let safetyCount = 0;

        // Occurrences are counted from DTSTART, so the cap has to allow for
        // series that began years before the range.
        while ((next = iter.next()) && safetyCount < MAX_OCCURRENCES_SCANNED) {
          safetyCount++;
          const occurrence = next.toJSDate().getTime();
          if (occurrence > end) break;
          if (occurrence >= start) {
            const detail = event.getOccurrenceDetails(next);
            // A rescheduled occurrence is emitted from its own VEVENT below,
            // which also covers one moved into or out of the range.
            if (detail.item.isRecurrenceException() && detail.item.recurrenceId.compare(next) === 0) continue;
            events.push(icalEventToCalendarEvent(detail.item, detail.startDate, detail.endDate, feed));
          }
        }
      } else {
        const evStart = event.startDate;
        const evEnd = event.endDate ?? evStart.clone();
        if (evStart.toJSDate().getTime() < end && evEnd.toJSDate().getTime() > start) {
          events.push(icalEventToCalendarEvent(event, evStart, evEnd, feed));
        }
      }
    } catch {
      // Skip malformed events
    }
  }

  return events;
}

function icalEventToCalendarEvent(
  event: ICAL.Event,
  startTime: ICAL.Time,
  endTime: ICAL.Time,
  feed: ICalFeed
): CalendarEvent {
  const vevent = event.component;

  const attendeeProps = vevent.getAllProperties("attendee");
  const attendees: Attendee[] = attendeeProps.map((prop) => {
    const cn = prop.getParameter("cn") as string | null;
    const partstat = (prop.getParameter("partstat") as string | null)?.toLowerCase();
    const email = (prop.getFirstValue() as string).replace(/^mailto:/i, "");
    return {
      name: cn ?? email,
      email,
      response: mapPartstat(partstat),
    };
  });

  const organizerProp = vevent.getFirstProperty("organizer");
  const organizerEmail = organizerProp
    ? (organizerProp.getFirstValue() as string).replace(/^mailto:/i, "").toLowerCase()
    : null;

  const selfEmail = "";
  const isOrganizer = organizerEmail ? attendees.length === 0 || organizerEmail === selfEmail : false;

  const description = (vevent.getFirstPropertyValue("description") as string | null) ?? undefined;
  const teamsLink = description?.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join[^\s<>"']*/)?.[0];

  const startDate = startTime.toJSDate();
  const endDate = endTime.toJSDate();
  const uid = (vevent.getFirstPropertyValue("uid") as string | null) ?? "";
  const startStr = startDate.toISOString();

  return {
    id: `${feed.id}_${uid}_${startStr}`,
    title: event.summary ?? "(No title)",
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    isOrganizer,
    isTentative: (vevent.getFirstPropertyValue("status") as string | null) === "TENTATIVE",
    attendees,
    location: (vevent.getFirstPropertyValue("location") as string | null) ?? undefined,
    teamsLink,
    description,
    bodyPreview: description ? description.replace(/\n/g, " ").slice(0, 80) : undefined,
    feedId: feed.id,
    feedLabel: feed.label,
    color: feed.color,
  };
}

function mapPartstat(s: string | null | undefined): Attendee["response"] {
  switch (s) {
    case "accepted": return "accepted";
    case "declined": return "declined";
    case "tentative": return "tentative";
    default: return "none";
  }
}
