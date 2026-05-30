import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, parseISO } from "date-fns";
import { CalendarEvent } from "../../types";


interface MonthViewProps {
  anchor: Date;
  events: CalendarEvent[];
}

export function MonthView({ anchor, events }: MonthViewProps) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  function eventsOnDay(day: Date): CalendarEvent[] {
    const str = format(day, "yyyy-MM-dd");
    return events
      .filter((e) => format(new Date(e.start), "yyyy-MM-dd") === str)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center py-2 text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7" style={{ minHeight: "120px" }}>
          {week.map((day) => {
            const dayEvents = eventsOnDay(day);
            const inMonth = isSameMonth(day, anchor);
            const today = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={`border-b border-r border-gray-100 dark:border-gray-700 p-1.5 ${!inMonth ? "bg-gray-50 dark:bg-gray-900" : "bg-white dark:bg-gray-800"}`}
              >
                <div className="flex justify-end mb-1">
                  <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                    ${today ? "bg-blue-600 text-white" : inMonth ? "text-gray-700 dark:text-gray-300" : "text-gray-300"}`}>
                    {format(day, "d")}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-1 px-1 py-0.5 rounded text-xs truncate cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 dark:bg-gray-700"
                      title={`${event.title}\n${format(parseISO(event.start), "h:mm a")}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                      <span className="truncate text-gray-700 dark:text-gray-300">{event.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">+{dayEvents.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
