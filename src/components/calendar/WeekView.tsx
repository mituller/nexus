import { useRef, useEffect, useState } from "react";
import { Video } from "lucide-react";
import { format, startOfWeek, addDays, isToday, parseISO, differenceInMinutes } from "date-fns";
import { CalendarEvent } from "../../types";
import { EventPopup } from "./EventPopup";

const HOUR_HEIGHT = 64; // px per hour
const START_HOUR = 6;
const END_HOUR = 22;
const VISIBLE_HOURS = END_HOUR - START_HOUR;
const COL_GAP = 2; // px gap between side-by-side events

interface PositionedEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}

// Group overlapping events into clusters, then assign side-by-side columns within each cluster.
function layoutDayEvents(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  // Sort by start time; longer events first on ties so they get column 0
  const sorted = [...events].sort((a, b) => {
    const d = a.start.localeCompare(b.start);
    if (d !== 0) return d;
    return (parseISO(b.end).getTime() - parseISO(b.start).getTime()) -
           (parseISO(a.end).getTime() - parseISO(a.start).getTime());
  });

  // Build overlap clusters: a cluster extends as long as any event in it overlaps the next one
  const clusters: CalendarEvent[][] = [];
  let cluster: CalendarEvent[] = [sorted[0]];
  let clusterEnd = sorted[0].end;

  for (let i = 1; i < sorted.length; i++) {
    const ev = sorted[i];
    if (ev.start < clusterEnd) {
      cluster.push(ev);
      if (ev.end > clusterEnd) clusterEnd = ev.end;
    } else {
      clusters.push(cluster);
      cluster = [ev];
      clusterEnd = ev.end;
    }
  }
  clusters.push(cluster);

  // Within each cluster assign columns greedily
  const result: PositionedEvent[] = [];
  for (const grp of clusters) {
    const colEnds: string[] = []; // latest end time occupying each column
    const colMap = new Map<string, number>();

    for (const ev of grp) {
      let col = colEnds.findIndex((end) => end <= ev.start);
      if (col === -1) { col = colEnds.length; colEnds.push(ev.end); }
      else colEnds[col] = ev.end;
      colMap.set(ev.id, col);
    }

    const total = colEnds.length;
    for (const ev of grp) {
      result.push({ event: ev, column: colMap.get(ev.id) ?? 0, totalColumns: total });
    }
  }

  return result;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function eventPositionStyle(
  event: CalendarEvent,
  column: number,
  totalColumns: number
): React.CSSProperties {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const startMins = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
  const durationMins = Math.max(differenceInMinutes(end, start), 15);
  const top = (startMins / 60) * HOUR_HEIGHT;
  const height = Math.max((durationMins / 60) * HOUR_HEIGHT, 20);

  const pct = 100 / totalColumns;
  const left = column === 0
    ? `1px`
    : `calc(${column * pct}% + ${COL_GAP / 2}px)`;
  const width = totalColumns === 1
    ? `calc(100% - 2px)`
    : `calc(${pct}% - ${column === 0 ? COL_GAP / 2 + 1 : COL_GAP}px)`;

  const { r, g, b } = hexToRgb(event.color);
  return {
    top: `${Math.max(top, 0)}px`,
    height: `${height}px`,
    left,
    width,
    backgroundColor: `rgba(${r},${g},${b},0.13)`,
    borderLeftColor: event.color,
    color: `rgb(${Math.max(r - 55, 0)},${Math.max(g - 55, 0)},${Math.max(b - 55, 0)})`,
    zIndex: column + 1,
  };
}

interface WeekViewProps {
  anchor: Date;
  events: CalendarEvent[];
  onEventNoteRequest?: (event: CalendarEvent) => void;
}

export function WeekView({ anchor, events, onEventNoteRequest }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(anchor, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [popup, setPopup] = useState<{ event: CalendarEvent; rect: DOMRect } | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_HEIGHT; // scroll to 7am
    }
  }, []);

  const hours = Array.from({ length: VISIBLE_HOURS }, (_, i) => START_HOUR + i);

  function eventsForDay(day: Date) {
    const str = format(day, "yyyy-MM-dd");
    return events.filter((e) => format(new Date(e.start), "yyyy-MM-dd") === str);
  }

  return (
    <>
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        <div className="w-14 shrink-0" />
        {days.map((day) => (
          <div key={day.toISOString()} className="flex-1 text-center py-2 border-l border-gray-100">
            <p className="text-xs uppercase text-gray-400 font-medium tracking-wide">{format(day, "EEE")}</p>
            <p className={`text-sm font-semibold mt-0.5 w-7 h-7 flex items-center justify-center mx-auto rounded-full
              ${isToday(day) ? "bg-blue-600 text-white" : "text-gray-700"}`}>
              {format(day, "d")}
            </p>
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: `${VISIBLE_HOURS * HOUR_HEIGHT}px` }}>
          {/* Time gutter */}
          <div className="w-14 shrink-0 relative select-none">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-right pr-2"
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT - 9}px` }}
              >
                <span className="text-xs text-gray-400">
                  {hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayEvents = eventsForDay(day);
            const positioned = layoutDayEvents(dayEvents);

            return (
              <div key={day.toISOString()} className="flex-1 border-l border-gray-100 relative">
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-gray-100"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Half-hour lines (lighter) */}
                {hours.map((hour) => (
                  <div
                    key={`${hour}-half`}
                    className="absolute w-full border-t border-gray-50"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday(day) && <CurrentTimeLine />}

                {/* Events */}
                {positioned.map(({ event, column, totalColumns }) => {
                  const start = parseISO(event.start);
                  const end = parseISO(event.end);
                  const durationMins = differenceInMinutes(end, start);
                  const isShort = durationMins < 45;

                  return (
                    <div
                      key={event.id}
                      className="absolute rounded border-l-2 overflow-hidden transition-all select-none cursor-pointer hover:brightness-95"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setPopup({ event, rect });
                      }}
                      style={eventPositionStyle(event, column, totalColumns)}
                      title={`${event.title}\n${format(start, "h:mm a")} – ${format(end, "h:mm a")}${event.feedLabel ? `\n${event.feedLabel}` : ""}`}
                    >
                      <div className="px-1.5 py-0.5 h-full overflow-hidden">
                        {isShort ? (
                          <div className="flex items-center gap-1 min-w-0">
                            <p className="text-xs font-semibold leading-tight truncate flex-1">{event.title}</p>
                            {event.teamsLink && <Video size={10} className="shrink-0 opacity-70" />}
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-semibold leading-snug line-clamp-2">{event.title}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className="text-xs opacity-75">{format(start, "h:mm a")}</p>
                              {event.teamsLink && (
                                <span className="flex items-center gap-0.5 text-xs opacity-75">
                                  · <Video size={10} /> Teams
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {popup && (
      <EventPopup
        event={popup.event}
        anchorRect={popup.rect}
        onClose={() => setPopup(null)}
        onAddNotes={(ev) => { setPopup(null); onEventNoteRequest?.(ev); }}
      />
    )}
    </>
  );
}

function CurrentTimeLine() {
  const now = new Date();
  const top = ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT;
  if (top < 0 || top > VISIBLE_HOURS * HOUR_HEIGHT) return null;

  return (
    <div className="absolute w-full z-20 pointer-events-none" style={{ top: `${top}px` }}>
      <div className="relative flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 -translate-x-1" />
        <div className="flex-1 border-t border-red-400" />
      </div>
    </div>
  );
}
