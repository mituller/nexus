import { describe, expect, it } from "vitest";
import { Task } from "../types";
import { GitIssue } from "../types/git";
import { isGitTask, issueToTask } from "./gitTasks";

function issue(overrides: Partial<GitIssue> = {}): GitIssue {
  return {
    id: "gh-1",
    iid: 12,
    title: "Fix login",
    state: "opened",
    webUrl: "https://github.com/acme/app/issues/12",
    projectName: "app",
    projectPath: "acme/app",
    labels: [],
    issueType: "issue",
    createdAt: "c",
    updatedAt: "u",
    provider: "github",
    ...overrides,
  };
}

describe("issueToTask", () => {
  it("copies the issue into an open task linked by URL", () => {
    expect(issueToTask(issue())).toEqual({
      title: "Fix login",
      description: "app #12",
      status: "open",
      priority: "medium",
      dueDate: undefined,
      sourceType: "github",
      sourceId: "https://github.com/acme/app/issues/12",
      tags: [],
    });
  });

  it.each([
    ["critical", "high"],
    ["high", "high"],
    ["medium", "medium"],
    ["low", "low"],
  ] as const)("maps %s priority to %s", (from, to) => {
    expect(issueToTask(issue({ priority: from })).priority).toBe(to);
  });

  it("stores a GitHub timestamp as the local date", () => {
    expect(issueToTask(issue({ dueDate: "2026-06-30T07:00:00Z" })).dueDate).toBe("2026-06-30");
    // 03:00 UTC on July 1 is still June 30 in New York
    expect(issueToTask(issue({ dueDate: "2026-07-01T03:00:00Z" })).dueDate).toBe("2026-06-30");
  });

  it("keeps a GitLab date-only due date on the same day", () => {
    expect(issueToTask(issue({ dueDate: "2026-06-30", provider: "gitlab" })).dueDate).toBe("2026-06-30");
  });

  it("drops priority labels but keeps labels that merely contain those letters", () => {
    const { tags } = issueToTask(issue({ labels: ["bug", "priority::high", "Low", "follow-up", "highlight"] }));
    expect(tags).toEqual(["bug", "follow-up", "highlight"]);
  });
});

describe("isGitTask", () => {
  const task = (overrides: Partial<Task>): Task => ({
    id: "t", title: "T", status: "open", priority: "low", tags: [], createdAt: "c", updatedAt: "u", ...overrides,
  });

  it("is true for a task linked to a GitHub or GitLab issue", () => {
    expect(isGitTask(task({ sourceType: "github", sourceId: "https://x" }))).toBe(true);
    expect(isGitTask(task({ sourceType: "gitlab", sourceId: "https://x" }))).toBe(true);
  });

  it("is false for a task linked to a note", () => {
    expect(isGitTask(task({ sourceType: "transcript", sourceId: "note-1" }))).toBe(false);
  });

  it("is false without a source id", () => {
    expect(isGitTask(task({ sourceType: "github" }))).toBe(false);
  });
});
