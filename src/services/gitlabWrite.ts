import { fetch } from "@tauri-apps/plugin-http";

async function glPost<T>(origin: string, token: string, path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${origin}/api/v4${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitLab ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function glPut<T>(origin: string, token: string, path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${origin}/api/v4${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitLab ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function getOrigin(baseUrl: string): string {
  try { return `${new URL(baseUrl.trim()).protocol}//${new URL(baseUrl.trim()).host}`; }
  catch { return baseUrl.replace(/\/$/, ""); }
}

export interface CreatedIssue {
  id: number;
  iid: number;
  webUrl: string;
  projectId: number;
}

export async function createGitLabIssue(
  baseUrl: string,
  token: string,
  projectId: string,
  title: string,
  description?: string,
  dueDate?: string,
  labels?: string[]
): Promise<CreatedIssue> {
  const origin = getOrigin(baseUrl);
  const raw = await glPost<Record<string, unknown>>(origin, token, `/projects/${encodeURIComponent(projectId)}/issues`, {
    title,
    description: description ?? "",
    due_date: dueDate ?? null,
    labels: labels?.join(",") ?? "",
  });
  return {
    id: raw.id as number,
    iid: raw.iid as number,
    webUrl: raw.web_url as string,
    projectId: raw.project_id as number,
  };
}

export async function closeGitLabIssue(
  baseUrl: string,
  token: string,
  projectId: number,
  issueIid: number
): Promise<void> {
  const origin = getOrigin(baseUrl);
  await glPut(origin, token, `/projects/${projectId}/issues/${issueIid}`, { state_event: "close" });
}

export async function getUserProjects(
  baseUrl: string,
  token: string
): Promise<Array<{ id: number; name: string; pathWithNamespace: string }>> {
  const origin = getOrigin(baseUrl);
  const url = `${origin}/api/v4/projects?membership=true&order_by=last_activity_at&per_page=30&simple=true`;
  const res = await fetch(url, { headers: { "PRIVATE-TOKEN": token } });
  if (!res.ok) return [];
  const raw = await res.json() as Record<string, unknown>[];
  return raw.map((p) => ({
    id: p.id as number,
    name: p.name as string,
    pathWithNamespace: p.path_with_namespace as string,
  }));
}
