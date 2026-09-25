/**
 * Provider-agnostic git integration types. Both the GitLab and GitHub
 * backends map into these shapes so the rest of the app (dashboard, week
 * ahead, search, briefings, task list) is provider-agnostic.
 *
 * Field names intentionally mirror the historical GitLab names (projectName,
 * issueType, iid) so the surface area stays stable.
 */

export type GitProvider = "gitlab" | "github";

export type GitPriority = "critical" | "high" | "medium" | "low";

export interface GitIssue {
  /** Opaque unique id (provider-specific). */
  id: string;
  /** Display number — GitLab iid or GitHub issue number. */
  iid: number;
  title: string;
  state: "opened" | "closed";
  webUrl: string;
  projectName: string;
  projectPath: string;
  labels: string[];
  milestone?: string;
  /** GitLab iterations only. */
  iteration?: string;
  dueDate?: string;
  priority?: GitPriority;
  /** "issue", "bug", "task", "epic"… */
  issueType: string;
  createdAt: string;
  updatedAt: string;
  provider: GitProvider;
}

export interface GitMR {
  id: string;
  iid: number;
  title: string;
  state: "opened" | "closed" | "merged";
  webUrl: string;
  projectName: string;
  projectPath: string;
  /** Empty when the provider doesn't return branches (GitHub search API). */
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
  hasConflicts: boolean;
  labels: string[];
  milestone?: string;
  createdAt: string;
  updatedAt: string;
  provider: GitProvider;
}

export interface GitUser {
  /** GitLab user id only (used for reliable assignee filtering). */
  id?: number;
  username: string;
  name: string;
  avatarUrl: string;
}