import ICAL from "ical.js";
import { fetch } from "@tauri-apps/plugin-http";
import { CalendarEvent, Attendee, ICalFeed } from "../types";

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

  const start = ICAL.Time.fromDateTimeString(rangeStart.toISOString());
  const end = ICAL.Time.fromDateTimeString(rangeEnd.toISOString());

  const events: CalendarEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    try {
      if (event.isRecurring()) {
        const iter = event.iterator();
        let next: ICAL.Time | null;
        let safetyCount = 0;

        while ((next = iter.next()) && safetyCount < 200) {
          safetyCount++;
          if (next.compare(end) > 0) break;
          if (next.compare(start) >= 0) {
            const detail = event.getOccurrenceDetails(next);
            events.push(icalEventToCalendarEvent(event, detail.startDate, detail.endDate, feed));
          }
        }
      } else {
        const evStart = event.startDate;
        const evEnd = event.endDate ?? evStart.clone();
        if (evStart.compare(end) < 0 && evEnd.compare(start) > 0) {
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
