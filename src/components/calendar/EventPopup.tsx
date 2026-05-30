import { X, Video, FileText, Clock, Users } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { CalendarEvent } from "../../types";
import { open as openUrl } from "@tauri-apps/plugin-shell";

interface EventPopupProps {
  event: CalendarEvent;
  anchorRect: DOMRect;
  onClose: () => void;
  onAddNotes: (event: CalendarEvent) => void;
}

export function EventPopup({ event, anchorRect, onClose, onAddNotes }: EventPopupProps) {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const duration = differenceInMinutes(end, start);
  const durationStr = duration >= 60
    ? `${Math.floor(duration / 60)}h${duration % 60 > 0 ? ` ${duration % 60}m` : ""}`
    : `${duration}m`;

  // Position popup to the right of the event, flipping left if near edge
  const popupWidth = 280;
  const left = anchorRect.right + 8 + popupWidth > window.innerWidth
    ? anchorRect.left - popupWidth - 8
    : anchorRect.right + 8;
  const top = Math.min(anchorRect.top, window.innerHeight - 300);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 w-70 overflow-hidden"
        style={{ left, top, width: popupWidth }}
      >
        {/* Color bar */}
        <div className="h-1.5" style={{ backgroundColor: event.color }} />

        <div className="p-4 space-y-3">
          {/* Title + close */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900 text-sm leading-snug flex-1">{event.title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X size={14} />
            </button>
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Clock size={12} className="shrink-0" />
            <span>{format(start, "h:mm a")} – {format(end, "h:mm a")} · {durationStr}</span>
          </div>

          {/* Calendar feed */}
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
            <span className="text-gray-500">{event.feedLabel}</span>
            {event.isOrganizer && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">organizer</span>}
            {event.isTentative && <span className="px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded text-xs">tentative</span>}
          </div>

          {/* Attendees */}
          {event.attendees.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-gray-600">
              <Users size={12} className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">
                {event.attendees.map((a) => a.name).join(", ")}
              </span>
            </div>
          )}

          {/* Location */}
          {event.location && (
            <p className="text-xs text-gray-500 truncate">{event.location}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1 border-t border-gray-100">
            <button
              onClick={() => { onAddNotes(event); onClose(); }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <FileText size={12} /> Meeting notes
            </button>
            {event.teamsLink && (
              <button
                onClick={() => openUrl(event.teamsLink!)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Video size={12} /> Join Teams
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
