import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeIssue } from "../services/github";
import { GitIssue } from "../types/git";
import { useGitStore } from "./git";
import { useSettingsStore } from "./settings";

vi.mock("../services/github");
vi.mock("../services/gitlab");
vi.mock("../services/store");

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
