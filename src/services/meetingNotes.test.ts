import { describe, expect, it } from "vitest";
import { CalendarEvent } from "../types";
import { buildMeetingNoteTemplate } from "./meetingNotes";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e", title: "Planning",
    start: new Date(2026, 5, 15, 9).toISOString(),
    end: new Date(2026, 5, 15, 10, 30).toISOString(),
    isOrganizer: false, isTentative: false, attendees: [], feedId: "f", feedLabel: "F", color: "c",
    ...overrides,
  };
}

describe("buildMeetingNoteTemplate", () => {
  it("titles the note after the meeting, with its local date and time", () => {
    const { title, content } = buildMeetingNoteTemplate(event());
    expect(title).toBe("Planning");
    expect(content).toContain("**Date:** Monday, June 15, 2026");
    expect(content).toContain("**Time:** 9:00 AM – 10:30 AM");
  });

  it("lists attendees", () => {
    const { content } = buildMeetingNoteTemplate(event({
      attendees: [{ name: "Ann", response: "accepted" }, { name: "Bob", response: "tentative" }],
    } as Partial<CalendarEvent>));
    expect(content).toContain("## Attendees\n- Ann\n- Bob\n");
  });

  it("leaves a blank attendee bullet when there are none", () => {
    expect(buildMeetingNoteTemplate(event()).content).toContain("## Attendees\n- \n");
  });

  it("names the organizer as You, or as Unknown when nobody has accepted", () => {
    expect(buildMeetingNoteTemplate(event({ isOrganizer: true })).content).toContain("**Organizer:** You");
    expect(buildMeetingNoteTemplate(event()).content).toContain("**Organizer:** Unknown");
  });

  it("includes every section", () => {
    const { content } = buildMeetingNoteTemplate(event());
    for (const heading of ["## Agenda", "## Notes", "## Decisions", "## Action Items"]) {
      expect(content).toContain(heading);
    }
  });
});
