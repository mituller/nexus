import { ExternalLink, Ticket, AlertCircle } from "lucide-react";
import { format, parseISO, isBefore } from "date-fns";
import { useFreshserviceStore } from "../../stores/freshservice";
import { FreshserviceTicket, TicketPriority } from "../../services/freshservice";

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  urgent: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  high: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
  medium: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400",
  low: "text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400",
};

export function FreshserviceSection() {
  const { tickets, loading, connected, error, openTicket } = useFreshserviceStore();

  if (!connected && !loading && !error) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
        <Ticket size={13} />
        Freshservice Tickets
      </h2>

      {loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading tickets…</p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <AlertCircle size={14} />
          {error.includes("401") || error.includes("403")
            ? "Invalid API key — check Settings."
            : "Failed to load tickets."}
        </div>
      )}

      {!loading && !error && tickets.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No open tickets assigned to you.</p>
      )}

      {tickets.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
          {tickets.slice(0, 6).map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} onOpen={openTicket} />
          ))}
        </div>
      )}
    </section>
  );
}

function TicketRow({ ticket, onOpen }: { ticket: FreshserviceTicket; onOpen: (url: string) => void }) {
  const isOverdue = ticket.dueBy && isBefore(parseISO(ticket.dueBy), new Date());

  return (
    <button
      onClick={() => onOpen(ticket.webUrl)}
      className="group w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 dark:text-gray-100 font-medium truncate">
          #{ticket.id} — {ticket.subject}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{ticket.statusLabel}</span>
          {ticket.priority && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
              {ticket.priority}
            </span>
          )}
          {ticket.category && (
            <span className="text-xs text-gray-400 dark:text-gray-500">· {ticket.category}</span>
          )}
          {ticket.dueBy && (
            <span className={`flex items-center gap-1 text-xs ${isOverdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
              · {isOverdue ? "Overdue · " : "Due "}
              {format(parseISO(ticket.dueBy), "MMM d")}
            </span>
          )}
        </div>
      </div>
      <ExternalLink size={13} className="shrink-0 text-gray-300 group-hover:text-teal-500 mt-0.5 transition-colors" />
    </button>
  );
}
