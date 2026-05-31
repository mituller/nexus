import { useEffect } from "react";
import { ExternalLink, RefreshCw, Ticket, AlertCircle } from "lucide-react";
import { format, parseISO, isBefore } from "date-fns";
import { useFreshserviceStore } from "../../stores/freshservice";
import { useSettingsStore } from "../../stores/settings";
import { FreshserviceTicket, TicketPriority, TicketStatus } from "../../services/freshservice";

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  urgent: "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  high: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
  medium: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400",
  low: "text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: "text-purple-600 bg-blue-50 dark:bg-purple-900/20 dark:text-purple-400",
  pending: "text-orange-500 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
  resolved: "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400",
  closed: "text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400",
  waiting: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400",
};

export function TicketsView() {
  const { tickets, loading, connected, error, fetch, openTicket } = useFreshserviceStore();
  const { settings } = useSettingsStore();

  const hasConfig = !!(settings.freshserviceUrl && settings.freshserviceApiKey);

  useEffect(() => {
    if (hasConfig && !connected && !loading) fetch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Freshservice Tickets</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {connected ? `${tickets.length} open / pending assigned to you` : "Not connected"}
          </p>
        </div>
        {hasConfig && (
          <button
            onClick={fetch}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        )}
      </div>

      {!hasConfig && (
        <div className="rounded-lg border border-blue-200 dark:border-purple-800 bg-blue-50 dark:bg-purple-900/20 px-4 py-3 text-sm text-purple-800 dark:text-purple-300">
          Add your Freshservice URL and API key in <strong>Settings → Freshservice</strong> to see your tickets.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          <AlertCircle size={14} />
          {error.includes("401") || error.includes("403")
            ? "Invalid API key — check Settings → Freshservice."
            : `Failed to load tickets: ${error}`}
        </div>
      )}

      {loading && (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && connected && tickets.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-600">
          <Ticket size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No open or pending tickets assigned to you.</p>
        </div>
      )}

      {!loading && tickets.length > 0 && (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} onOpen={openTicket} />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketRow({ ticket, onOpen }: { ticket: FreshserviceTicket; onOpen: (url: string) => void }) {
  const isOverdue = ticket.dueBy && isBefore(parseISO(ticket.dueBy), new Date());

  return (
    <button
      onClick={() => onOpen(ticket.webUrl)}
      className="group w-full flex items-start gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors text-left"
    >
      <Ticket size={16} className="mt-0.5 shrink-0 text-teal-500" />

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate flex-1">
            #{ticket.id} — {ticket.subject}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[ticket.status]}`}>
            {ticket.statusLabel}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
            {ticket.priority}
          </span>
          {ticket.type && ticket.type !== "Incident" && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{ticket.type}</span>
          )}
          {ticket.category && (
            <span className="text-xs text-gray-400 dark:text-gray-500">· {ticket.category}</span>
          )}
          {ticket.requesterName && (
            <span className="text-xs text-gray-400 dark:text-gray-500">· {ticket.requesterName}</span>
          )}
          {ticket.dueBy && (
            <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
              · Due {format(parseISO(ticket.dueBy), "MMM d")}
              {isOverdue && " · overdue"}
            </span>
          )}
        </div>
      </div>

      <ExternalLink size={13} className="shrink-0 text-gray-300 group-hover:text-teal-500 mt-0.5 transition-colors" />
    </button>
  );
}
