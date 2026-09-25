import { fetch } from "@tauri-apps/plugin-http";
import { GitIssue, GitMR, GitUser } from "../types/git";
import { extractPriorityFromLabels } from "../utils/priority";

/**
 * GitHub REST API client — read-only mirror of the GitLab integration.
 * Feeds the same GitIssue/GitMR shapes: issues assigned to you, plus open
 * pull requests you authored (equivalent of "my merge requests").
 */

const API = "https://api.github.com";
const USER_AGENT = "Nexus/0.1 (+https://github.com/mituller/nexus)";

async function ghGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function getGitHubUser(token: string): Promise<GitUser> {
  const u = await ghGet<{ login: string; name?: string; avatar_url?: string }>(token, "/user");
  return { username: u.login, name: u.name || u.login, avatarUrl: u.avatar_url ?? "" };
}

export async function getAssignedIssues(token: string): Promise<GitIssue[]> {
  // filter=assigned → issues (and PRs, which we skip) assigned to the token owner
  const raw = await ghGet<Array<Record<string, unknown>>>(
    token,
    "/issues?filter=assigned&state=open&per_page=30&sort=updated"
  );
  const out: GitIssue[] = [];
  for (const item of raw) {
    if (item.pull_request) continue; // PRs are shown under "My Pull Requests"
    const issue = mapIssue(item);
    if (issue) out.push(issue);
  }
  return out;
}

export async function getOpenPullRequests(token: string): Promise<GitMR[]> {
  const raw = await ghGet<{ items?: Array<Record<string, unknown>> }>(
    token,
    "/search/issues?q=is:pr+is:open+author:@me&per_page=20&sort=updated"
  );
  const out: GitMR[] = [];
  for (const item of raw.items ?? []) {
    const mr = mapPR(item);
    if (mr) out.push(mr);
  }
  return out;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

/** "https://api.github.com/repos/owner/repo" → "owner/repo" */
function repoPath(repositoryUrl: string): string {
  return repositoryUrl.replace(`${API}/repos/`, "").replace(/\/$/, "");
}

function mapIssue(item: Record<string, unknown>): GitIssue | null {
  const number = item.number as number | undefined;
  if (!number) return null;
  const labels = (item.labels as Array<{ name: string }> | null)?.map((l) => l.name) ?? [];
  const milestone = item.milestone as Record<string, unknown> | null;
  const path = repoPath(String(item.repository_url ?? ""));
  const name = path.split("/").pop() ?? path;

  return {
    id: `gh-${item.id}`,
    iid: number,
    title: String(item.title ?? ""),
    state: item.state === "closed" ? "closed" : "opened",
    webUrl: String(item.html_url ?? ""),
    projectName: name,
    projectPath: path,
    labels,
    milestone: milestone?.title as string | undefined,
    dueDate: milestone?.due_on as string | undefined,
    priority: extractPriorityFromLabels(labels),
    issueType: "issue",
    createdAt: String(item.created_at ?? ""),
    updatedAt: String(item.updated_at ?? ""),
    provider: "github",
  };
}

function mapPR(item: Record<string, unknown>): GitMR | null {
  const number = item.number as number | undefined;
  if (!number) return null;
  const labels = (item.labels as Array<{ name: string }> | null)?.map((l) => l.name) ?? [];
  const path = repoPath(String(item.repository_url ?? ""));
  const name = path.split("/").pop() ?? path;
  const state = String(item.state ?? "open");
  const mergedAt = item.merged_at as string | null;

  return {
    id: `gh-${item.id}`,
    iid: number,
    title: String(item.title ?? ""),
    state: state === "closed" ? (mergedAt ? "merged" : "closed") : "opened",
    webUrl: String(item.html_url ?? ""),
    projectName: name,
    projectPath: path,
    // The search API doesn't return branches — rows guard on empty strings.
    sourceBranch: "",
    targetBranch: "",
    isDraft: !!(item.draft) || /^(Draft|WIP):/i.test(String(item.title ?? "")),
    hasConflicts: false,
    labels,
    createdAt: String(item.created_at ?? ""),
    updatedAt: String(item.updated_at ?? ""),
    provider: "github",
  };
}