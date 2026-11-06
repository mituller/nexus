import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-shell";
import { closeIssue, getAssignedIssues, getGitHubUser, getOpenPullRequests } from "../services/github";
import { getAssignedIssues as getGitLabIssues, getGitLabUser, getOpenMergeRequests } from "../services/gitlab";
import { GitIssue } from "../types/git";
import { gitErrorMessage, useGitStore } from "./git";
import { useSettingsStore } from "./settings";

vi.mock("../services/github");
vi.mock("../services/gitlab");
vi.mock("../services/store");
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

function issue(id: string, provider: GitIssue["provider"] = "github"): GitIssue {
  return {
    id, iid: 12, title: id, state: "opened", webUrl: `https://x/${id}`, projectName: "app",
    projectPath: "acme/app", labels: [], issueType: "issue", createdAt: "c", updatedAt: "u", provider,
  };
}

beforeEach(() => {
  useGitStore.setState(useGitStore.getInitialState(), true);
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getInitialState().settings, githubToken: "tok" },
  });
});

describe("closeIssue", () => {
  it("closes on GitHub, then removes only that issue from the list", async () => {
    const a = issue("a");
    useGitStore.setState({ issues: [a, issue("b")] });
    await useGitStore.getState().closeIssue(a);
    expect(closeIssue).toHaveBeenCalledWith("tok", "acme/app", 12);
    expect(useGitStore.getState().issues.map((i) => i.id)).toEqual(["b"]);
  });

  it("keeps the issue listed when GitHub refuses", async () => {
    const a = issue("a");
    useGitStore.setState({ issues: [a] });
    vi.mocked(closeIssue).mockRejectedValue(new Error("GitHub 403"));
    await expect(useGitStore.getState().closeIssue(a)).rejects.toThrow("GitHub 403");
    expect(useGitStore.getState().issues).toEqual([a]);
  });

  it("refuses a GitLab issue without calling GitHub", async () => {
    const a = issue("a", "gitlab");
    useGitStore.setState({ issues: [a] });
    await expect(useGitStore.getState().closeIssue(a)).rejects.toThrow();
    expect(closeIssue).not.toHaveBeenCalled();
    expect(useGitStore.getState().issues).toEqual([a]);
  });
});

describe("fetch", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getInitialState().settings, gitProvider: "github", githubToken: "tok" },
    });
  });

  it("records the error and the provider that failed", async () => {
    vi.mocked(getGitHubUser).mockRejectedValue(new Error("GitHub 403: nope"));
    await useGitStore.getState().fetch();
    const { provider, error, connected, loading } = useGitStore.getState();
    expect(provider).toBe("github");
    expect(error).toContain("GitHub 403");
    expect(connected).toBe(false);
    expect(loading).toBe(false);
  });

  it("still shows issues when pull requests are refused, and reports why", async () => {
    vi.mocked(getGitHubUser).mockResolvedValue({ username: "u", name: "U", avatarUrl: "" });
    vi.mocked(getAssignedIssues).mockResolvedValue([issue("a")]);
    vi.mocked(getOpenPullRequests).mockRejectedValue(new Error("GitHub 403: nope"));
    await useGitStore.getState().fetch();
    const { issues, mrs, error, connected } = useGitStore.getState();
    expect(issues.map((i) => i.id)).toEqual(["a"]);
    expect(mrs).toEqual([]);
    expect(error).toContain("GitHub 403");
    expect(connected).toBe(true);
  });

  it("fails outright when issues are refused", async () => {
    useGitStore.setState({ issues: [issue("old")] });
    vi.mocked(getGitHubUser).mockResolvedValue({ username: "u", name: "U", avatarUrl: "" });
    vi.mocked(getAssignedIssues).mockRejectedValue(new Error("GitHub 403: nope"));
    vi.mocked(getOpenPullRequests).mockResolvedValue([]);
    await useGitStore.getState().fetch();
    const { error, connected } = useGitStore.getState();
    expect(error).toContain("GitHub 403");
    expect(connected).toBe(false);
  });

  it("clears the error once a retry succeeds", async () => {
    useGitStore.setState({ error: "Error: GitHub 403: nope" });
    vi.mocked(getGitHubUser).mockResolvedValue({ username: "u", name: "U", avatarUrl: "" });
    vi.mocked(getAssignedIssues).mockResolvedValue([issue("a")]);
    vi.mocked(getOpenPullRequests).mockResolvedValue([]);
    await useGitStore.getState().fetch();
    const { error, connected, issues } = useGitStore.getState();
    expect(error).toBeNull();
    expect(connected).toBe(true);
    expect(issues.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("gitErrorMessage", () => {
  it("names a rejected token", () => {
    expect(gitErrorMessage("Error: GitHub 401: bad", "github")).toBe("Invalid GitHub token — check Settings.");
  });

  it.each(["Error: GitHub 403: nope", "Error: GitHub 404: nope"])("points at token access for %s", (error) => {
    expect(gitErrorMessage(error, "github")).toContain("refused access");
  });

  it("names the provider and keeps the detail otherwise", () => {
    expect(gitErrorMessage("Error: network down", "gitlab")).toBe("GitLab error: Error: network down");
  });
});

describe("fetch from GitLab", () => {
  const user = { id: 9, username: "ann", name: "Ann", avatarUrl: "" };

  beforeEach(() => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getInitialState().settings,
        gitProvider: "gitlab", gitlabUrl: "https://gitlab.com/acme", gitlabToken: "gl-tok", gitlabProjectFilters: "1,2",
      },
    });
    vi.mocked(getGitLabUser).mockResolvedValue(user);
    vi.mocked(getGitLabIssues).mockResolvedValue([issue("a", "gitlab")]);
    vi.mocked(getOpenMergeRequests).mockResolvedValue([]);
  });

  it("does nothing with no token", async () => {
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, gitlabToken: "" } });
    await useGitStore.getState().fetch();
    expect(getGitLabUser).not.toHaveBeenCalled();
    expect(useGitStore.getState().connected).toBe(false);
  });

  it("loads the items using the user's id and the project filters", async () => {
    await useGitStore.getState().fetch();
    expect(getGitLabUser).toHaveBeenCalledWith("https://gitlab.com/acme", "gl-tok");
    expect(getGitLabIssues).toHaveBeenCalledWith("https://gitlab.com/acme", "gl-tok", "1,2", 9);
    expect(getOpenMergeRequests).toHaveBeenCalledWith("https://gitlab.com/acme", "gl-tok", "1,2");
    expect(useGitStore.getState()).toMatchObject({ provider: "gitlab", user, connected: true, loading: false, error: null });
    expect(useGitStore.getState().issues).toHaveLength(1);
  });

  it("records the error when the user can't be loaded", async () => {
    vi.mocked(getGitLabUser).mockRejectedValue(new Error("GitLab 401: nope"));
    await useGitStore.getState().fetch();
    expect(useGitStore.getState()).toMatchObject({ provider: "gitlab", connected: false, loading: false });
    expect(useGitStore.getState().error).toContain("GitLab 401");
  });
});

describe("openIssue", () => {
  it("opens the URL in the browser", async () => {
    useGitStore.getState().openIssue("https://x/1");
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("https://x/1"));
  });
});
