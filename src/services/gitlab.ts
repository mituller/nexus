import { fetch } from "@tauri-apps/plugin-http";

export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  state: "opened" | "closed";
  webUrl: string;
  projectId: number;
  projectName: string;
  projectPath: string;
  labels: string[];
  milestone?: string;
  iteration?: string;
  dueDate?: string;
  priority?: "critical" | "high" | "medium" | "low";
  createdAt: string;
  updatedAt: string;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatarUrl: string;
}

// Parse the user-supplied URL into a base API origin and an optional group path.
// e.g. "https://gitlab.com/WSB_Dev" → { origin: "https://gitlab.com", group: "WSB_Dev" }
// e.g. "https://gitlab.com"         → { origin: "https://gitlab.com", group: null }
function parseGitLabUrl(raw: string): { origin: string; group: string | null } {
  try {
    const u = new URL(raw.trim());
    const group = u.pathname.replace(/^\/|\/$/g, "") || null;
    return { origin: `${u.protocol}//${u.host}`, group };
  } catch {
    return { origin: raw.replace(/\/$/, ""), group: null };
  }
}

async function glGet<T>(origin: string, token: string, path: string): Promise<T> {
  const url = `${origin}/api/v4${path}`;
  const res = await fetch(url, {
    headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitLab ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function getGitLabUser(baseUrl: string, token: string): Promise<GitLabUser> {
  const { origin } = parseGitLabUrl(baseUrl);
  const raw = await glGet<Record<string, unknown>>(origin, token, "/user");
  return {
    id: raw.id as number,
    username: raw.username as string,
    name: raw.name as string,
    avatarUrl: raw.avatar_url as string,
  };
}

export async function getAssignedIssues(
  baseUrl: string,
  token: string,
  projectFilters?: string
): Promise<GitLabIssue[]> {
  const { origin, group } = parseGitLabUrl(baseUrl);
  const base = "?assigned_to_me=true&state=opened&per_page=30&order_by=updated_at";

  let path: string;

  if (projectFilters) {
    // Explicit project ID filter wins over group
    const ids = projectFilters.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      path = `/issues${base}&project_ids[]=${ids.join("&project_ids[]=")}`;
    } else {
      path = group ? `/groups/${encodeURIComponent(group)}/issues${base}` : `/issues${base}`;
    }
  } else if (group) {
    // Group path in URL → scope to that group
    path = `/groups/${encodeURIComponent(group)}/issues${base}`;
  } else {
    path = `/issues${base}`;
  }

  const raw = await glGet<Record<string, unknown>[]>(origin, token, path);

  return raw.map((issue) => {
    const labels = (issue.labels as string[]) ?? [];
    const refs = issue.references as Record<string, string> | null;
    // refs.full is like "group/project#12" — strip the issue number to get project path
    const fullRef = refs?.full ?? "";
    const projectPath = fullRef.replace(/#\d+$/, "");
    const projectName = projectPath.split("/").pop() ?? String(issue.project_id);

    return {
      id: issue.id as number,
      iid: issue.iid as number,
      title: issue.title as string,
      state: issue.state as "opened" | "closed",
      webUrl: issue.web_url as string,
      projectId: issue.project_id as number,
      projectName,
      projectPath,
      labels,
      milestone: (issue.milestone as { title: string } | null)?.title,
      iteration: formatIteration(issue.iteration as IterationRaw | null),
      dueDate: (issue.due_date as string) ?? undefined,
      priority: extractPriority(labels),
      createdAt: issue.created_at as string,
      updatedAt: issue.updated_at as string,
    };
  });
}

interface IterationRaw {
  title: string | null;
  start_date?: string;
  due_date?: string;
  sequence?: number;
  iid?: number;
}

function formatIteration(iter: IterationRaw | null): string | undefined {
  if (!iter) return undefined;
  if (iter.title) return iter.title;
  // title is null in some GitLab API responses — fall back to date range
  if (iter.start_date && iter.due_date) {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(iter.start_date)} – ${fmt(iter.due_date)}`;
  }
  if (iter.sequence) return `Sprint ${iter.sequence}`;
  return `Iteration ${iter.iid ?? ""}`;
}

function extractPriority(labels: string[]): GitLabIssue["priority"] {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("critical"))) return "critical";
  if (lower.some((l) => l.includes("high"))) return "high";
  if (lower.some((l) => l.includes("medium"))) return "medium";
  if (lower.some((l) => l.includes("low"))) return "low";
  return undefined;
}
