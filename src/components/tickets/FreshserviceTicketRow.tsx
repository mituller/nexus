import { memo } from "react";
import { ExternalLink, Ticket } from "lucide-react";
import { FreshserviceTicket } from "../../services/freshservice";
import { FRESHSERVICE_PRIORITY_COLORS } from "../../utils/priority";
import { isOverdue, formatShortDate } from "../../utils/calendar";
import { openExternalUrl } from "../../utils/calendar";

interface FreshserviceTicketRowProps {
  ticket: FreshserviceTicket;
  compact?: boolean;
}

export const FreshserviceTicketRow = memo(function FreshserviceTicketRow({ ticket, compact = false }: FreshserviceTicketRowProps) {
  const overdue = ticket.dueBy && isOverdue(ticket.dueBy);
  const pad = compact ? "px-3 py-2" : "px-4 py-3";

  return (
    <button
      onClick={() => openExternalUrl(ticket.webUrl)}
      className={`group w-full flex items-start gap-3 ${pad} bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors text-left`}
    >
      <Ticket size={compact ? 13 : 16} className="mt-0.5 shrink-0 text-teal-500" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
          #{ticket.id} — {ticket.subject}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{ticket.statusLabel}</span>
          {ticket.priority && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${FRESHSERVICE_PRIORITY_COLORS[ticket.priority]}`}>
              {ticket.priority}
            </span>
          )}
          {ticket.category && <span className="text-xs text-gray-400 dark:text-gray-500">· {ticket.category}</span>}
          {ticket.dueBy && (
            <span className={`text-xs ${overdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
              · {overdue ? "Overdue · " : "Due "}{formatShortDate(ticket.dueBy)}
            </span>
          )}
        </div>
      </div>

      <ExternalLink size={13} className="shrink-0 text-gray-300 group-hover:text-teal-500 mt-0.5 transition-colors" />
    </button>
  );
});
