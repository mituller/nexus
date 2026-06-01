import { Ticket, AlertCircle } from "lucide-react";
import { useFreshserviceStore } from "../../stores/freshservice";
import { FreshserviceTicketRow } from "../tickets/FreshserviceTicketRow";

export function FreshserviceSection() {
  const { tickets, loading, connected, error } = useFreshserviceStore();

  if (!connected && !loading && !error) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
        <Ticket size={13} />
        Freshservice Tickets
      </h2>

      {loading && <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading tickets…</p>}

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
        <div className="space-y-1">
          {tickets.slice(0, 6).map((ticket) => (
            <FreshserviceTicketRow key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
    </section>
  );
}
