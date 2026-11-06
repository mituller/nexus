import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { closeIssue, getAssignedIssues, getGitHubUser, getOpenPullRequests } from "./github";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

function respondWith(body: unknown) {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body)));
}

const rawIssue = {
  id: 99,
  number: 12,
  title: "Fix it",
  state: "open",
  html_url: "https://github.com/acme/app/issues/12",
  repository_url: "https://api.github.com/repos/acme/app",
  labels: [{ name: "priority: high" }, { name: "bug" }],
  milestone: { title: "v1", due_on: "2026-07-01T07:00:00Z" },
  created_at: "c",
  updated_at: "u",
};

describe("closeIssue", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}"));
  });

  it("patches the issue to closed as completed", async () => {
    await closeIssue("tok", "acme/app", 12);
    const [url, init] = vi.mocked(fetch).mock.lastCall as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/app/issues/12");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ state: "closed", state_reason: "completed" });
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "Content-Type": "application/json" });
  });

  it("reports the status when GitHub refuses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Resource not accessible", { status: 403 }));
    await expect(closeIssue("tok", "acme/app", 12)).rejects.toThrow("GitHub 403");
  });
});

describe("getGitHubUser", () => {
  it("maps the login and avatar", async () => {
    respondWith({ login: "octo", name: "Octo Cat", avatar_url: "a.png" });
    expect(await getGitHubUser("tok")).toEqual({ username: "octo", name: "Octo Cat", avatarUrl: "a.png" });
  });

  it("falls back to the login when the profile has no name", async () => {
    respondWith({ login: "octo" });
    expect(await getGitHubUser("tok")).toEqual({ username: "octo", name: "octo", avatarUrl: "" });
  });

  it("includes the status and a shortened body in errors", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("x".repeat(500), { status: 401 }));
    const error: Error = await getGitHubUser("tok").catch((e) => e);
    expect(error.message).toBe(`GitHub 401: ${"x".repeat(200)}`);
  });
});

describe("getAssignedIssues", () => {
  it("asks for open issues assigned to the token's owner", async () => {
    respondWith([]);
    await getAssignedIssues("tok");
    const [url, init] = vi.mocked(fetch).mock.lastCall as [string, RequestInit];
    expect(url).toContain("https://api.github.com/issues?filter=assigned&state=open");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("maps an issue to the shared shape", async () => {
    respondWith([rawIssue]);
    expect(await getAssignedIssues("tok")).toEqual([{
      id: "gh-99",
      iid: 12,
      title: "Fix it",
      state: "opened",
      webUrl: "https://github.com/acme/app/issues/12",
      projectName: "app",
      projectPath: "acme/app",
      labels: ["priority: high", "bug"],
      milestone: "v1",
      dueDate: "2026-07-01",
      priority: "high",
      issueType: "issue",
      createdAt: "c",
      updatedAt: "u",
      provider: "github",
    }]);
  });

  it("skips pull requests, which GitHub returns as issues", async () => {
    respondWith([rawIssue, { ...rawIssue, id: 100, number: 13, pull_request: { url: "x" } }]);
    expect((await getAssignedIssues("tok")).map((i) => i.iid)).toEqual([12]);
  });

  it("handles an issue with no labels or milestone", async () => {
    respondWith([{ ...rawIssue, labels: null, milestone: null }]);
    const [issue] = await getAssignedIssues("tok");
    expect(issue.labels).toEqual([]);
    expect(issue.milestone).toBeUndefined();
    expect(issue.dueDate).toBeUndefined();
    expect(issue.priority).toBeUndefined();
  });

  it("drops an item with no number", async () => {
    respondWith([{ ...rawIssue, number: undefined }]);
    expect(await getAssignedIssues("tok")).toEqual([]);
  });
});

describe("getOpenPullRequests", () => {
  const rawPR = { ...rawIssue, id: 7, number: 3, title: "Add it", html_url: "https://github.com/acme/app/pull/3" };

  it("searches for open pull requests by the token's owner", async () => {
    respondWith({ items: [] });
    await getOpenPullRequests("tok");
    const [url] = vi.mocked(fetch).mock.lastCall as [string];
    expect(url).toContain("/search/issues?q=is:pr+is:open+author:@me");
  });

  it("maps a pull request to the shared shape", async () => {
    respondWith({ items: [rawPR] });
    expect(await getOpenPullRequests("tok")).toMatchObject([{
      id: "gh-7",
      iid: 3,
      state: "opened",
      projectPath: "acme/app",
      sourceBranch: "",
      isDraft: false,
      hasConflicts: false,
      provider: "github",
    }]);
  });

  it.each([
    [{ draft: true }, true],
    [{ title: "Draft: Add it" }, true],
    [{ title: "wip: Add it" }, true],
    [{ title: "Drafting the docs" }, false],
  ])("reads %j as draft: %s", async (fields, isDraft) => {
    respondWith({ items: [{ ...rawPR, ...fields }] });
    const [pr] = await getOpenPullRequests("tok");
    expect(pr.isDraft).toBe(isDraft);
  });

  it("tells merged and closed pull requests apart", async () => {
    respondWith({ items: [
      { ...rawPR, state: "closed", merged_at: "2026-06-01" },
      { ...rawPR, state: "closed", merged_at: null },
    ] });
    expect((await getOpenPullRequests("tok")).map((p) => p.state)).toEqual(["merged", "closed"]);
  });

  it("copes with a response that has no items", async () => {
    respondWith({});
    expect(await getOpenPullRequests("tok")).toEqual([]);
  });
});
