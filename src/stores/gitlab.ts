import { create } from "zustand";
import { GitLabIssue, GitLabMR, GitLabUser, getAssignedIssues, getOpenMergeRequests, getGitLabUser } from "../services/gitlab";
import { useSettingsStore } from "./settings";

interface GitLabStore {
  issues: GitLabIssue[];
  mrs: GitLabMR[];
  user: GitLabUser | null;
  loading: boolean;
  connected: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  openIssue: (url: string) => void;
}

export const useGitLabStore = create<GitLabStore>((set) => ({
  issues: [],
  mrs: [],
  user: null,
  loading: false,
  connected: false,
  error: null,

  fetch: async () => {
    const { settings } = useSettingsStore.getState();
    if (!settings.gitlabToken || !settings.gitlabUrl) return;

    set({ loading: true, error: null });
    try {
      // Fetch user first so we have their ID for reliable assignee filtering
      const user = await getGitLabUser(settings.gitlabUrl, settings.gitlabToken);
      const [issues, mrs] = await Promise.all([
        getAssignedIssues(settings.gitlabUrl, settings.gitlabToken, settings.gitlabProjectFilters, user.id),
        getOpenMergeRequests(settings.gitlabUrl, settings.gitlabToken, settings.gitlabProjectFilters),
      ]);
      set({ user, issues, mrs, connected: true, loading: false });
    } catch (e) {
      set({ error: String(e), connected: false, loading: false });
    }
  },

  openIssue: (url) => {
    import("@tauri-apps/plugin-shell").then((m) => m.open(url));
  },
}));
