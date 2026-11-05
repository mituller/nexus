import { create } from "zustand";
import { GitIssue, GitMR, GitUser, GitProvider } from "../types/git";
import { getAssignedIssues as getGitLabIssues, getOpenMergeRequests, getGitLabUser } from "../services/gitlab";
import { closeIssue as closeGitHubIssue, getGitHubUser, getAssignedIssues as getGitHubIssues, getOpenPullRequests } from "../services/github";
import { useSettingsStore } from "./settings";

export const GIT_PROVIDER_LABEL: Record<GitProvider, string> = {
  gitlab: "GitLab",
  github: "GitHub",
};

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
        const [issues, mrs] = await Promise.all([
          getGitHubIssues(token),
          getOpenPullRequests(token),
        ]);
        set({ provider: "github", user, issues, mrs, connected: true, loading: false });
      } else {
        // Fetch user first so we have their ID for reliable assignee filtering
        const user = await getGitLabUser(settings.gitlabUrl, settings.gitlabToken);
        const [issues, mrs] = await Promise.all([
          getGitLabIssues(settings.gitlabUrl, settings.gitlabToken, settings.gitlabProjectFilters, user.id ?? undefined),
          getOpenMergeRequests(settings.gitlabUrl, settings.gitlabToken, settings.gitlabProjectFilters),
        ]);
        set({ provider: "gitlab", user, issues, mrs, connected: true, loading: false });
      }
    } catch (e) {
      set({ error: String(e), connected: false, loading: false });
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