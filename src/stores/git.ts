import { create } from "zustand";
import { GitIssue, GitMR, GitUser, GitProvider } from "../types/git";
import { getAssignedIssues as getGitLabIssues, getOpenMergeRequests, getGitLabUser } from "../services/gitlab";
import { closeIssue as closeGitHubIssue, getGitHubUser, getAssignedIssues as getGitHubIssues, getOpenPullRequests } from "../services/github";
import { useSettingsStore } from "./settings";

export const GIT_PROVIDER_LABEL: Record<GitProvider, string> = {
  gitlab: "GitLab",
  github: "GitHub",
};

/** A failed fetch as a message to show the user. */
export function gitErrorMessage(error: string, provider: GitProvider): string {
  const label = GIT_PROVIDER_LABEL[provider];
  if (error.includes(" 401")) return `Invalid ${label} token — check Settings.`;
  if (error.includes(" 403") || error.includes(" 404")) {
    return `${label} refused access — check the token's repository access and permissions in Settings.`;
  }
  return `${label} error: ${error}`;
}

/**
 * Settle both lists together. Issues are required, but a token without pull
 * request access shouldn't hide them, so a failed MR/PR list only sets `error`.
 */
async function loadItems(issues: Promise<GitIssue[]>, mrs: Promise<GitMR[]>) {
  const [issuesResult, mrsResult] = await Promise.allSettled([issues, mrs]);
  if (issuesResult.status === "rejected") throw issuesResult.reason;
  return {
    issues: issuesResult.value,
    mrs: mrsResult.status === "fulfilled" ? mrsResult.value : [],
    error: mrsResult.status === "rejected" ? String(mrsResult.reason) : null,
  };
}

interface GitStore {
  /** Which provider the current data came from (settings at last fetch). */
  provider: GitProvider;
  issues: GitIssue[];
  mrs: GitMR[];
  user: GitUser | null;
  loading: boolean;
  connected: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  /** Close an issue on GitHub, then drop it from the list. Rejects if GitHub refuses. */
  closeIssue: (issue: GitIssue) => Promise<void>;
  openIssue: (url: string) => void;
}

export const useGitStore = create<GitStore>((set) => ({
  provider: "gitlab",
  issues: [],
  mrs: [],
  user: null,
  loading: false,
  connected: false,
  error: null,

  fetch: async () => {
    const { settings } = useSettingsStore.getState();
    const isGitHub = settings.gitProvider === "github";
    const token = isGitHub ? settings.githubToken : settings.gitlabToken;
    if (!token) return;

    set({ loading: true, error: null });
    try {
      if (isGitHub) {
        const user = await getGitHubUser(token);
        const items = await loadItems(getGitHubIssues(token), getOpenPullRequests(token));
        set({ provider: "github", user, ...items, connected: true, loading: false });
      } else {
        // Fetch user first so we have their ID for reliable assignee filtering
        const user = await getGitLabUser(settings.gitlabUrl, settings.gitlabToken);
        const items = await loadItems(
          getGitLabIssues(settings.gitlabUrl, settings.gitlabToken, settings.gitlabProjectFilters, user.id ?? undefined),
          getOpenMergeRequests(settings.gitlabUrl, settings.gitlabToken, settings.gitlabProjectFilters),
        );
        set({ provider: "gitlab", user, ...items, connected: true, loading: false });
      }
    } catch (e) {
      // Record the provider too, so the error isn't blamed on the previous one
      set({ provider: isGitHub ? "github" : "gitlab", error: String(e), connected: false, loading: false });
    }
  },

  closeIssue: async (issue) => {
    if (issue.provider !== "github") throw new Error("Closing issues is only supported on GitHub");
    const { settings } = useSettingsStore.getState();
    await closeGitHubIssue(settings.githubToken, issue.projectPath, issue.iid);
    set((state) => ({ issues: state.issues.filter((i) => i.id !== issue.id) }));
  },

  openIssue: (url) => {
    import("@tauri-apps/plugin-shell").then((m) => m.open(url));
  },
}));