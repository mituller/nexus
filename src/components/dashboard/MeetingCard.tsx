import { memo } from "react";
import { ExternalLink, Video, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CalendarEvent } from "../../types";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { isAllDay } from "../../utils/calendar";

interface MeetingCardProps {
  event: CalendarEvent;
  onAddNotes?: (event: CalendarEvent) => void;
}

export const MeetingCard = memo(function MeetingCard({ event, onAddNotes }: MeetingCardProps) {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const isPast = end < new Date();
  const allDay = isAllDay(event);

  const otherAttendees = event.attendees
    .filter((a) => !event.isOrganizer || a.response !== "accepted")
    .slice(0, 4);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 pl-4 pr-4 py-3 flex gap-3 ${isPast ? "opacity-50" : ""}`}>
      <div className="w-1 rounded-full shrink-0 self-stretch" style={{ backgroundColor: event.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-gray-900 dark:text-white text-sm leading-snug">{event.title}</p>
          {event.teamsLink && (
            <button
              onClick={() => openUrl(event.teamsLink!)}
              className="shrink-0 flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800"
            >
              <Video size={12} /> Join
            </button>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${isPast ? "text-gray-400 dark:text-gray-500" : "text-gray-500 dark:text-gray-500"}`}>
          {allDay ? "All Day" : `${format(start, "h:mm a")}–${format(end, "h:mm a")}`}
          {isPast && !allDay && " · may have passed"}
          {event.feedLabel && (
            <span className="ml-1.5 font-medium" style={{ color: event.color }}>
              · {event.feedLabel}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {event.isOrganizer && <Badge color="blue">organizer</Badge>}
          {!event.isOrganizer && <Badge color="gray">attendee</Badge>}
          {event.isTentative && <Badge color="orange">tentative</Badge>}
        </div>
        {(otherAttendees.length > 0 || event.bodyPreview) && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
            {otherAttendees.map((a) => a.name.split(" ")[0].toLowerCase()).join(", ")}
            {event.bodyPreview ? " — " + event.bodyPreview.slice(0, 60) : ""}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {onAddNotes && !allDay && (
            <button
              onClick={() => onAddNotes(event)}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            >
              <FileText size={11} /> Meeting notes
            </button>
          )}
          {event.teamsLink && (
            <button
              onClick={() => openUrl(event.teamsLink!)}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-purple-700 transition-colors"
            >
              <ExternalLink size={11} /> Teams link
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function Badge({ color, children }: { color: "blue" | "gray" | "orange"; children: React.ReactNode }) {
  const classes = {
    blue: "bg-blue-100 text-purple-700",
    gray: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-500",
    orange: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${classes[color]}`}>
      {children}
    </span>
  );
}
