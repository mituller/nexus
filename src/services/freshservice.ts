import { fetch } from "@tauri-apps/plugin-http";

export type TicketStatus = "open" | "pending" | "resolved" | "closed" | "waiting";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface FreshserviceTicket {
  id: number;
  subject: string;
  status: TicketStatus;
  statusLabel: string;
  priority: TicketPriority;
  type: string;
  category?: string;
  dueBy?: string;
  createdAt: string;
  updatedAt: string;
  requesterName?: string;
  tags: string[];
  webUrl: string;
}

// Standard Freshservice status codes
const STATUS_MAP: Record<number, TicketStatus> = {
  2: "open",
  3: "pending",
  4: "resolved",
  5: "closed",
  6: "waiting", // Waiting on Customer
  7: "waiting", // Waiting on Third Party
};

const STATUS_LABEL: Record<number, string> = {
  2: "Open",
  3: "Pending",
  4: "Resolved",
  5: "Closed",
  6: "Waiting on Customer",
  7: "Waiting on Third Party",
};

const PRIORITY_MAP: Record<number, TicketPriority> = {
  1: "low",
  2: "medium",
  3: "high",
  4: "urgent",
};

function authHeader(apiKey: string): string {
  return "Basic " + btoa(`${apiKey}:X`);
}

function getOrigin(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.replace(/\/$/, "");
  }
}

async function fsGet<T>(baseUrl: string, apiKey: string, path: string): Promise<T> {
  const url = `${getOrigin(baseUrl)}/api/v2${path}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(apiKey), "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Freshservice ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// Try to get the current agent's numeric ID so we can filter by responder_id
async function getCurrentAgentId(baseUrl: string, apiKey: string): Promise<number | null> {
  const paths = ["/agents/me", "/profile"];
  for (const path of paths) {
    try {
      const raw = await fsGet<Record<string, unknown>>(baseUrl, apiKey, path);
      const id = (raw.id ?? (raw.agent as Record<string, unknown>)?.id) as number | null;
      if (id) return id;
    } catch { /* try next */ }
  }
  return null;
}

function mapTicket(t: Record<string, unknown>, origin: string): FreshserviceTicket {
  const requester = t.requester as Record<string, string> | null;
  const statusCode = t.status as number;
  return {
    id: t.id as number,
    subject: (t.subject as string) || "(No subject)",
    status: STATUS_MAP[statusCode] ?? "open",
    statusLabel: STATUS_LABEL[statusCode] ?? `Status ${statusCode}`,
    priority: PRIORITY_MAP[t.priority as number] ?? "medium",
    type: (t.type as string) ?? "Incident",
    category: (t.category as string) ?? undefined,
    dueBy: (t.due_by as string) ?? undefined,
    createdAt: t.created_at as string,
    updatedAt: t.updated_at as string,
    requesterName: requester?.name ?? undefined,
    tags: (t.tags as string[]) ?? [],
    webUrl: `${origin}/support/tickets/${t.id}`,
  };
}

export async function getAssignedTickets(
  baseUrl: string,
  apiKey: string
): Promise<FreshserviceTicket[]> {
  const origin = getOrigin(baseUrl);
  const seen = new Set<number>();
  const results: FreshserviceTicket[] = [];

  const agentId = await getCurrentAgentId(baseUrl, apiKey);

  // Try all known approaches in sequence
  // Fetch all tickets without filters, then match by responder_id client-side
  // (direct filter params are rejected by this Freshservice instance)
  let page = 1;
  const maxPages = 5; // safety cap — fetches up to 500 tickets

  while (page <= maxPages) {
    try {
      const data = await fsGet<{ tickets: Record<string, unknown>[] }>(
        baseUrl, apiKey,
        `/tickets?per_page=100&page=${page}&order_by=updated_at&order_type=desc&include=requester`
      );
      const tickets = data.tickets ?? [];

      if (tickets.length === 0) break;

      for (const t of tickets) {
        const code = t.status as number;
        if (code === 4 || code === 5) continue; // skip resolved/closed
        // Include if assigned to our agent, or if we don't have agent ID include all
        const responderId = t.responder_id as number | null;
        if (agentId && responderId !== agentId) continue;
        const id = t.id as number;
        if (!seen.has(id)) { seen.add(id); results.push(mapTicket(t, origin)); }
      }

      // Stop early if we got a partial page (last page)
      if (tickets.length < 100) break;
      page++;
    } catch (e) {
      console.error(`[Freshservice] page ${page} failed:`, String(e).slice(0, 150));
      break;
    }
  }


  return results;
}
