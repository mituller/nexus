// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format } from "date-fns";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, deleteTask, updateTask } from "../../services/db";
import { closeIssue, getAssignedIssues, getGitHubUser, getOpenPullRequests } from "../../services/github";
import { createGitLabIssue } from "../../services/gitlabWrite";
import { useGitStore } from "../../stores/git";
import { useSettingsStore } from "../../stores/settings";
import { useTaskStore } from "../../stores/tasks";
import { AppSettings, Task } from "../../types";
import { GitIssue, GitMR } from "../../types/git";
import { TaskList } from "./TaskList";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("../../services/db");
vi.mock("../../services/github");
vi.mock("../../services/gitlab");
vi.mock("../../services/gitlabWrite");
vi.mock("../../services/store");

function task(title: string, overrides: Partial<Task> = {}): Task {
  return { id: title, title, status: "open", priority: "medium", tags: [], createdAt: "c", updatedAt: "u", ...overrides };
}

function issue(title: string, overrides: Partial<GitIssue> = {}): GitIssue {
  return {
    id: title, iid: 12, title, state: "opened", webUrl: `https://github.com/acme/app/issues/${title}`,
    projectName: "app", projectPath: "acme/app", labels: [], issueType: "issue",
    createdAt: "c", updatedAt: "u", provider: "github", ...overrides,
  };
}

function mr(title: string, overrides: Partial<GitMR> = {}): GitMR {
  return {
    id: title, iid: 3, title, state: "opened", webUrl: `https://github.com/acme/app/pull/${title}`,
    projectName: "app", projectPath: "acme/app", sourceBranch: "", targetBranch: "", isDraft: false,
    hasConflicts: false, labels: [], createdAt: "c", updatedAt: "u", provider: "github", ...overrides,
  };
}

function settings(overrides: Partial<AppSettings> = {}) {
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getInitialState().settings, gitProvider: "github", githubToken: "tok", ...overrides },
  });
}

function connected(items: { issues?: GitIssue[]; mrs?: GitMR[] } = {}) {
  useGitStore.setState({ provider: "github", connected: true, issues: [], mrs: [], ...items });
}

function closest(text: string): HTMLElement {
  return screen.getByText(text).closest<HTMLElement>(".group")!;
}

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useGitStore.setState(useGitStore.getInitialState(), true);
  settings();
  vi.mocked(createTask).mockImplementation(async (t) => ({ ...t, id: "new", createdAt: "c", updatedAt: "u" } as Task));
});

afterEach(cleanup);

describe("personal tasks", () => {
  it("shows an empty message with no tasks and no git connection", () => {
    settings({ githubToken: "" });
    render(<TaskList />);
    expect(screen.getByText("No tasks — you're all caught up.")).toBeTruthy();
    expect(screen.getByText("0 open")).toBeTruthy();
  });

  it("sorts by priority, and hides finished tasks until asked", async () => {
    useTaskStore.setState({ tasks: [
      task("Low one", { priority: "low" }),
      task("High one", { priority: "high" }),
      task("Finished", { status: "done" }),
    ] });
    const { container } = render(<TaskList />);
    const titles = () => [...container.querySelectorAll("[data-task-id]")].map((row) => row.getAttribute("data-task-id"));

    expect(titles()).toEqual(["High one", "Low one"]);

    await userEvent.click(screen.getByRole("button", { name: /1 completed/ }));
    expect(titles()).toEqual(["High one", "Finished", "Low one"]);
  });

  it("completes, reopens and deletes", async () => {
    useTaskStore.setState({ tasks: [task("Open"), task("Finished", { status: "done" })] });
    render(<TaskList />);
    await userEvent.click(screen.getByRole("button", { name: /1 completed/ }));

    await userEvent.click(within(closest("Open")).getByRole("checkbox"));
    expect(updateTask).toHaveBeenCalledWith("Open", expect.objectContaining({ status: "done" }));

    vi.mocked(updateTask).mockClear();
    await userEvent.click(within(closest("Finished")).getByRole("checkbox"));
    expect(updateTask).toHaveBeenCalledWith("Finished", { status: "open" });

    const buttons = within(closest("Open")).getAllByRole("button");
    await userEvent.click(buttons[buttons.length - 1]);
    expect(deleteTask).toHaveBeenCalledWith("Open");
  });

  it("flags a task past its due date", () => {
    useTaskStore.setState({ tasks: [task("Late", { dueDate: "2020-01-05" }), task("Undated")] });
    render(<TaskList />);
    expect(within(closest("Late")).getByText(/Due Jan 5/).textContent).toContain("overdue");
    expect(within(closest("Undated")).getByText("No due date")).toBeTruthy();
  });

  it("doesn't flag a task or issue on the day it's due", () => {
    const today = format(new Date(), "yyyy-MM-dd");
    useTaskStore.setState({ tasks: [task("Due today", { dueDate: today })] });
    connected({ issues: [issue("Issue due today", { dueDate: today })] });
    render(<TaskList />);
    expect(within(closest("Due today")).getByText(/^Due \w+ \d/).textContent).not.toContain("overdue");
    expect(within(closest("Issue due today")).getByText(/^Due \w+ \d/).textContent).not.toContain("overdue");
  });

  it("opens the new task form and edits an existing task", async () => {
    useTaskStore.setState({ tasks: [task("Open")] });
    render(<TaskList />);

    await userEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(screen.getByText("New Task")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(within(closest("Open")).getByTitle("Edit task"));
    expect(screen.getByText("Edit Task")).toBeTruthy();
    expect((screen.getByPlaceholderText("Task title") as HTMLInputElement).value).toBe("Open");
  });

  it("opens a git task's issue, and a note task's note", async () => {
    const onOpenNote = vi.fn();
    useTaskStore.setState({ tasks: [
      task("From issue", { sourceType: "github", sourceId: "https://x/1" }),
      task("From note", { sourceType: "transcript", sourceId: "n1" }),
    ] });
    render(<TaskList onOpenNote={onOpenNote} />);

    await userEvent.click(within(closest("From issue")).getByTitle("Open source issue"));
    expect(openUrl).toHaveBeenCalledWith("https://x/1");
    expect(within(closest("From issue")).queryByTitle("Open source note")).toBeNull();

    await userEvent.click(within(closest("From note")).getByTitle("Open source note"));
    expect(onOpenNote).toHaveBeenCalledWith("n1");
  });
});

describe("filters", () => {
  const rowIds = (container: HTMLElement) =>
    [...container.querySelectorAll("[data-task-id]")].map((row) => row.getAttribute("data-task-id"));

  beforeEach(() => {
    useTaskStore.setState({ tasks: [
      task("Alpha", { priority: "high", tags: ["work"], sourceType: "github", description: "first" }),
      task("Beta", { priority: "low", tags: ["home"], sourceType: "manual", description: "second" }),
    ] });
  });

  it("filters by priority and source, and clears", async () => {
    const { container } = render(<TaskList />);
    const [priority, source] = screen.getAllByRole("combobox");

    await userEvent.selectOptions(priority, "high");
    expect(rowIds(container)).toEqual(["Alpha"]);
    expect(screen.getByText("1 shown")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rowIds(container)).toHaveLength(2);

    await userEvent.selectOptions(source, "github");
    expect(rowIds(container)).toEqual(["Alpha"]);
  });

  it("searches titles and descriptions", async () => {
    const { container } = render(<TaskList />);
    await userEvent.type(screen.getByPlaceholderText("Search tasks…"), "SECOND");
    await waitFor(() => expect(rowIds(container)).toEqual(["Beta"]));
  });

  it("filters by tag", async () => {
    const { container } = render(<TaskList />);
    await userEvent.click(screen.getByPlaceholderText("Filter by tag…"));
    await userEvent.click(screen.getByRole("button", { name: "home" }));
    expect(rowIds(container)).toEqual(["Beta"]);
  });
});

describe("arriving at a specific task", () => {
  it("clears filters that would hide it, shows it if finished, and reports back", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onFocusHandled = vi.fn();
    useTaskStore.setState({ tasks: [task("Open", { priority: "low" }), task("Finished", { status: "done", priority: "high" })] });

    const { rerender, container } = render(<TaskList />);
    await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "low");
    rerender(<TaskList focusTaskId="Finished" onFocusHandled={onFocusHandled} />);

    await waitFor(() => expect(container.querySelector('[data-task-id="Finished"]')).toBeTruthy());
    expect(onFocusHandled).toHaveBeenCalled();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("reports back when the task no longer exists", () => {
    const onFocusHandled = vi.fn();
    render(<TaskList focusTaskId="gone" onFocusHandled={onFocusHandled} />);
    expect(onFocusHandled).toHaveBeenCalled();
  });
});

describe("refresh and git errors", () => {
  it("hides Refresh when there's no token", () => {
    settings({ githubToken: "" });
    render(<TaskList />);
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("loads issues when clicked", async () => {
    vi.mocked(getGitHubUser).mockResolvedValue({ username: "ann", name: "Ann", avatarUrl: "" });
    vi.mocked(getAssignedIssues).mockResolvedValue([issue("New issue")]);
    vi.mocked(getOpenPullRequests).mockResolvedValue([]);
    render(<TaskList />);

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("New issue")).toBeTruthy();
    expect(screen.getByText(/GitHub — Open Items \(1\)/)).toBeTruthy();
  });

  it("disables Refresh while loading", () => {
    useGitStore.setState({ loading: true });
    render(<TaskList />);
    expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a helpful error when the token is rejected", async () => {
    vi.mocked(getGitHubUser).mockRejectedValue(new Error("GitHub 401: bad"));
    render(<TaskList />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Invalid GitHub token — check Settings.")).toBeTruthy();
  });

  it("still shows issues when only the pull request list is refused", async () => {
    vi.mocked(getGitHubUser).mockResolvedValue({ username: "ann", name: "Ann", avatarUrl: "" });
    vi.mocked(getAssignedIssues).mockResolvedValue([issue("Still here")]);
    vi.mocked(getOpenPullRequests).mockRejectedValue(new Error("GitHub 403: no"));
    render(<TaskList />);

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("Still here")).toBeTruthy();
    expect(screen.getByText(/GitHub refused access/)).toBeTruthy();
  });

  it("says when no issues are assigned", () => {
    connected();
    render(<TaskList />);
    expect(screen.getByText("No open GitHub issues assigned to you.")).toBeTruthy();
  });

  it("doesn't say that while loading", () => {
    connected();
    useGitStore.setState({ loading: true });
    render(<TaskList />);
    expect(screen.queryByText("No open GitHub issues assigned to you.")).toBeNull();
  });
});

describe("GitHub issue rows", () => {
  it("shows the issue's details, leaving priority labels to the priority badge", () => {
    connected({ issues: [issue("Bug", {
      priority: "high", milestone: "v1", iteration: "Sprint 2", dueDate: "2020-01-05",
      labels: ["priority: high", "a", "b", "c", "d"],
    })] });
    render(<TaskList />);
    const row = within(closest("Bug"));
    expect(row.getByText("app #12")).toBeTruthy();
    expect(row.getByText("● high")).toBeTruthy();
    expect(row.getByText("v1")).toBeTruthy();
    expect(row.getByText("⟳ Sprint 2")).toBeTruthy();
    expect(row.getByText(/Due Jan 5/).textContent).toContain("overdue");
    expect(row.queryByText("priority: high")).toBeNull();
    expect(row.getByText("c")).toBeTruthy();
    expect(row.queryByText("d")).toBeNull();
  });

  it("opens the issue from its title and from the link icon", async () => {
    connected({ issues: [issue("Bug")] });
    useGitStore.setState({ openIssue: vi.fn() });
    render(<TaskList />);
    await userEvent.click(screen.getByText("Bug"));
    await userEvent.click(screen.getByRole("button", { name: "Open in browser" }));
    expect(useGitStore.getState().openIssue).toHaveBeenCalledTimes(2);
    expect(useGitStore.getState().openIssue).toHaveBeenCalledWith("https://github.com/acme/app/issues/Bug");
  });

  it("asks before closing, and Cancel closes nothing", async () => {
    connected({ issues: [issue("Bug")] });
    render(<TaskList />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;

    await userEvent.click(checkbox);
    expect(closeIssue).not.toHaveBeenCalled();
    expect(screen.getByText("Close this issue on GitHub?")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Close this issue on GitHub?")).toBeNull();
    expect(checkbox.checked).toBe(false);
    expect(closeIssue).not.toHaveBeenCalled();
  });

  it("closes the issue once confirmed and removes the row", async () => {
    connected({ issues: [issue("Bug"), issue("Other")] });
    render(<TaskList />);

    await userEvent.click(within(closest("Bug")).getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Close issue" }));

    await waitFor(() => expect(screen.queryByText("Bug")).toBeNull());
    expect(closeIssue).toHaveBeenCalledWith("tok", "acme/app", 12);
    expect(screen.getByText("Other")).toBeTruthy();
  });

  it("disables the buttons while closing", async () => {
    let finish!: () => void;
    vi.mocked(closeIssue).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    connected({ issues: [issue("Bug")] });
    render(<TaskList />);

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Close issue" }));

    expect((screen.getByRole("button", { name: "Closing…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    await waitFor(() => expect(screen.queryByText("Bug")).toBeNull());
  });

  it("explains a refused close and keeps the issue", async () => {
    vi.mocked(closeIssue).mockRejectedValue(new Error("GitHub 403: Resource not accessible"));
    connected({ issues: [issue("Bug")] });
    render(<TaskList />);

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Close issue" }));

    expect(await screen.findByText(/Your token may need write access to Issues/)).toBeTruthy();
    expect(screen.getByText("Bug")).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("shows any other error as it is", async () => {
    vi.mocked(closeIssue).mockRejectedValue(new Error("network down"));
    connected({ issues: [issue("Bug")] });
    render(<TaskList />);

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Close issue" }));

    expect(await screen.findByText("Error: network down")).toBeTruthy();
  });

  it("adds the issue as a linked task, then marks it as added", async () => {
    connected({ issues: [issue("Bug", { priority: "critical" })] });
    render(<TaskList />);

    await userEvent.click(screen.getByRole("button", { name: "Add as task" }));

    await waitFor(() => expect(screen.getByTitle("Already added as a task")).toBeTruthy());
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "Bug",
      priority: "high",
      sourceType: "github",
      sourceId: "https://github.com/acme/app/issues/Bug",
    }));
    expect(screen.queryByRole("button", { name: "Add as task" })).toBeNull();
  });

  it("recognizes an issue that's already a task", () => {
    useTaskStore.setState({ tasks: [task("Linked", { sourceType: "github", sourceId: "https://github.com/acme/app/issues/Bug" })] });
    connected({ issues: [issue("Bug")] });
    render(<TaskList />);
    expect(screen.getByTitle("Already added as a task")).toBeTruthy();
  });

  it("offers no close checkbox for GitLab issues", () => {
    useGitStore.setState({ provider: "gitlab", connected: true, issues: [issue("Bug", { provider: "gitlab" })] });
    render(<TaskList />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Add as task" })).toBeTruthy();
    expect(screen.getByText(/GitLab — Open Items/)).toBeTruthy();
  });
});

describe("pull and merge requests", () => {
  it("shows pull requests with their state, and opens them", async () => {
    connected({ mrs: [mr("Add it", { isDraft: true, hasConflicts: true, sourceBranch: "feat", milestone: "v1" })] });
    useGitStore.setState({ openIssue: vi.fn() });
    render(<TaskList />);

    expect(screen.getByText(/GitHub — My Pull Requests \(1\)/)).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Conflicts")).toBeTruthy();
    expect(screen.getByText("feat")).toBeTruthy();

    await userEvent.click(screen.getByText("Add it"));
    expect(useGitStore.getState().openIssue).toHaveBeenCalledWith("https://github.com/acme/app/pull/Add it");
  });

  it("calls them merge requests on GitLab", () => {
    useGitStore.setState({ provider: "gitlab", connected: true, mrs: [mr("Add it", { provider: "gitlab" })] });
    render(<TaskList />);
    expect(screen.getByText(/GitLab — My Merge Requests \(1\)/)).toBeTruthy();
  });
});

describe("creating a GitLab issue from a task", () => {
  const gitlab = {
    gitProvider: "gitlab" as const, gitlabToken: "gl", gitlabUrl: "https://gitlab.com", gitlabDefaultProjectId: "42",
  };

  it("needs GitLab, a token and a default project", () => {
    useTaskStore.setState({ tasks: [task("Open")] });
    settings({ ...gitlab, gitlabDefaultProjectId: "" });
    const { rerender } = render(<TaskList />);
    expect(screen.queryByTitle("Create GitLab issue")).toBeNull();

    settings();
    rerender(<TaskList />);
    expect(screen.queryByTitle("Create GitLab issue")).toBeNull();
  });

  it("creates the issue, then links to it", async () => {
    vi.mocked(createGitLabIssue).mockResolvedValue({ id: 1, iid: 2, webUrl: "https://gitlab.com/x/2", projectId: 42 });
    useTaskStore.setState({ tasks: [task("Open", { description: "Why", dueDate: "2030-01-05", tags: ["a"] })] });
    settings(gitlab);
    render(<TaskList />);

    await userEvent.click(screen.getByTitle("Create GitLab issue"));

    expect(createGitLabIssue).toHaveBeenCalledWith("https://gitlab.com", "gl", "42", "Open", "Why", "2030-01-05", ["a"]);
    await userEvent.click(await screen.findByTitle("Open in GitLab"));
    expect(openUrl).toHaveBeenCalledWith("https://gitlab.com/x/2");
    expect(screen.queryByTitle("Create GitLab issue")).toBeNull();
  });

  it("keeps the button when creation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createGitLabIssue).mockRejectedValue(new Error("GitLab 403"));
    useTaskStore.setState({ tasks: [task("Open")] });
    settings(gitlab);
    render(<TaskList />);

    await userEvent.click(screen.getByTitle("Create GitLab issue"));

    await waitFor(() => expect((screen.getByTitle("Create GitLab issue") as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByTitle("Open in GitLab")).toBeNull();
  });
});
