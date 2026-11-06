import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { getAssignedIssues, getGitLabUser, getOpenMergeRequests } from "./gitlab";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

function respondWith(body: unknown) {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body)));
}

function requestedUrl(): string {
  return vi.mocked(fetch).mock.lastCall![0] as string;
}

const rawIssue = {
  id: 501,
  iid: 12,
  title: "Fix it",
  state: "opened",
  web_url: "https://gitlab.com/acme/tools/app/-/issues/12",
  project_id: 77,
  references: { full: "acme/tools/app#12" },
  labels: ["Priority::High", "bug"],
  milestone: { title: "v1" },
  iteration: null,
  due_date: "2026-07-01",
  issue_type: "test_case",
  created_at: "c",
  updated_at: "u",
};

beforeEach(() => respondWith([]));

describe("getGitLabUser", () => {
  it("maps the user and sends the token", async () => {
    respondWith({ id: 9, username: "ann", name: "Ann", avatar_url: "a.png" });
    const user = await getGitLabUser("https://gitlab.example.com/acme", "tok");
    expect(user).toMatchObject({ username: "ann", name: "Ann", avatarUrl: "a.png" });
    expect(requestedUrl()).toBe("https://gitlab.example.com/api/v4/user");
    expect(vi.mocked(fetch).mock.lastCall![1]!.headers).toMatchObject({ "PRIVATE-TOKEN": "tok" });
  });

  // git.ts passes user.id to getAssignedIssues for its assignee_id filter, but
  // the id is never copied here, so that filter is never used.
  it.fails("KNOWN BUG: returns the user's id", async () => {
    respondWith({ id: 9, username: "ann", name: "Ann", avatar_url: "a.png" });
    expect((await getGitLabUser("https://gitlab.com", "tok")).id).toBe(9);
  });

  it("includes the status in errors", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(getGitLabUser("https://gitlab.com", "tok")).rejects.toThrow("GitLab 401: nope");
  });
});

describe("getAssignedIssues URL", () => {
  it("lists across GitLab when the URL has no group", async () => {
    await getAssignedIssues("https://gitlab.com", "tok");
    expect(requestedUrl()).toMatch(/^https:\/\/gitlab\.com\/api\/v4\/issues\?/);
  });

  it("scopes to the group in the URL, encoding subgroups", async () => {
    await getAssignedIssues("https://gitlab.com/acme/tools/", "tok");
    expect(requestedUrl()).toContain("/api/v4/groups/acme%2Ftools/issues?");
  });

  it("prefers project filters over the group", async () => {
    await getAssignedIssues("https://gitlab.com/acme", "tok", " 1, 2 ,");
    expect(requestedUrl()).toContain("/api/v4/issues?");
    expect(requestedUrl()).toContain("&project_ids[]=1&project_ids[]=2");
  });

  it("falls back to the group when the filters are blank", async () => {
    await getAssignedIssues("https://gitlab.com/acme", "tok", " , ");
    expect(requestedUrl()).toContain("/api/v4/groups/acme/issues?");
  });

  it("filters by assignee id when it has one", async () => {
    await getAssignedIssues("https://gitlab.com", "tok", undefined, 9);
    expect(requestedUrl()).toContain("assignee_id=9");
    expect(requestedUrl()).not.toContain("assigned_to_me");
  });

  it("otherwise asks for the token owner's issues", async () => {
    await getAssignedIssues("https://gitlab.com", "tok");
    expect(requestedUrl()).toContain("scope=assigned_to_me");
  });
});

describe("getAssignedIssues mapping", () => {
  it("maps an issue to the shared shape", async () => {
    respondWith([rawIssue]);
    expect(await getAssignedIssues("https://gitlab.com", "tok")).toEqual([{
      id: "501",
      iid: 12,
      title: "Fix it",
      state: "opened",
      webUrl: "https://gitlab.com/acme/tools/app/-/issues/12",
      projectId: "77",
      projectName: "app",
      projectPath: "acme/tools/app",
      labels: ["Priority::High", "bug"],
      milestone: "v1",
      iteration: undefined,
      dueDate: "2026-07-01",
      priority: "high",
      issueType: "test case",
      createdAt: "c",
      updatedAt: "u",
      provider: "gitlab",
    }]);
  });

  it("defaults the issue type, and leaves a missing due date undefined", async () => {
    respondWith([{ ...rawIssue, issue_type: undefined, due_date: null }]);
    const [issue] = await getAssignedIssues("https://gitlab.com", "tok");
    expect(issue.issueType).toBe("issue");
    expect(issue.dueDate).toBeUndefined();
  });

  async function iterationFor(iteration: unknown) {
    respondWith([{ ...rawIssue, iteration }]);
    return (await getAssignedIssues("https://gitlab.com", "tok"))[0].iteration;
  }

  it("names an iteration by its title first", async () => {
    expect(await iterationFor({ title: "Sprint Blue", sequence: 4 })).toBe("Sprint Blue");
  });

  it("falls back to the sprint number, then the iid", async () => {
    expect(await iterationFor({ title: null, sequence: 4 })).toBe("Sprint 4");
    expect(await iterationFor({ title: null, iid: 8 })).toBe("Iteration 8");
  });

  // new Date("2026-06-01") is midnight UTC, which is May 31 west of Greenwich.
  it.fails("KNOWN BUG: an untitled iteration's date range keeps its dates", async () => {
    const label = await iterationFor({ title: null, start_date: "2026-06-01", due_date: "2026-06-14" });
    expect(label).toBe("Jun 1 – Jun 14");
  });
});

describe("getOpenMergeRequests", () => {
  const rawMR = {
    id: 601, iid: 3, title: "Add it", state: "opened", web_url: "https://x/3", project_id: 77,
    references: { full: "acme/app!3" }, source_branch: "feat", target_branch: "main",
    draft: false, has_conflicts: true, labels: ["ui"], milestone: { title: "v1" },
    created_at: "c", updated_at: "u",
  };

  it("maps a merge request to the shared shape", async () => {
    respondWith([rawMR]);
    expect(await getOpenMergeRequests("https://gitlab.com", "tok")).toEqual([{
      id: "601", iid: 3, title: "Add it", state: "opened", webUrl: "https://x/3",
      projectName: "app", projectPath: "acme/app", sourceBranch: "feat", targetBranch: "main",
      isDraft: false, hasConflicts: true, labels: ["ui"], milestone: "v1",
      createdAt: "c", updatedAt: "u", provider: "gitlab",
    }]);
  });

  it("detects drafts by flag or title", async () => {
    respondWith([{ ...rawMR, draft: true }, { ...rawMR, id: 2, title: "WIP: Add it" }]);
    const mrs = await getOpenMergeRequests("https://gitlab.com", "tok");
    expect(mrs.map((m) => m.isDraft)).toEqual([true, true]);
  });

  it.each([
    ["https://gitlab.com", undefined, "/api/v4/merge_requests?"],
    ["https://gitlab.com/acme", undefined, "/api/v4/groups/acme/merge_requests?"],
    ["https://gitlab.com/acme", "1,2", "/api/v4/merge_requests?"],
    ["https://gitlab.com/acme", " , ", "/api/v4/groups/acme/merge_requests?"],
    ["https://gitlab.com", " , ", "/api/v4/merge_requests?"],
  ])("for %s with filters %j, requests %s", async (url, filters, expected) => {
    await getOpenMergeRequests(url, "tok", filters);
    expect(requestedUrl()).toContain(expected);
  });
});
