// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open } from "@tauri-apps/plugin-shell";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGitStore } from "../../stores/git";
import { GitIssue } from "../../types/git";
import { GitSection } from "./GitSection";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("../../services/github");
vi.mock("../../services/gitlab");
vi.mock("../../services/store");

function issue(title: string, overrides: Partial<GitIssue> = {}): GitIssue {
  return {
    id: title, iid: 12, title, state: "opened", webUrl: `https://x/${title}`, projectName: "app", projectPath: "acme/app",
    labels: [], issueType: "issue", createdAt: "c", updatedAt: "u", provider: "github", ...overrides,
  };
}

beforeEach(() => {
  useGitStore.setState(useGitStore.getInitialState(), true);
  useGitStore.setState({ provider: "github" });
});

afterEach(cleanup);

describe("GitSection", () => {
  it("is hidden until git is set up", () => {
    const { container } = render(<GitSection />);
    expect(container.innerHTML).toBe("");
  });

  it("shows loading", () => {
    useGitStore.setState({ loading: true });
    render(<GitSection />);
    expect(screen.getByText("Loading issues…")).toBeTruthy();
  });

  it("shows a helpful error", () => {
    useGitStore.setState({ error: "Error: GitHub 403: no" });
    render(<GitSection />);
    expect(screen.getByText(/GitHub refused access/)).toBeTruthy();
    expect(screen.queryByText("No open issues assigned to you.")).toBeNull();
  });

  it("says when there are no issues, and names the provider and user", () => {
    useGitStore.setState({ connected: true, user: { username: "ann", name: "Ann", avatarUrl: "" } });
    render(<GitSection />);
    expect(screen.getByText("No open issues assigned to you.")).toBeTruthy();
    expect(screen.getByText(/GitHub — Open Items/)).toBeTruthy();
    expect(screen.getByText("(@ann)")).toBeTruthy();
  });

  it("shows at most eight issues", () => {
    useGitStore.setState({ connected: true, issues: Array.from({ length: 9 }, (_, i) => issue(`Issue ${i}`)) });
    render(<GitSection />);
    expect(screen.getByText("Issue 7")).toBeTruthy();
    expect(screen.queryByText("Issue 8")).toBeNull();
  });
});

describe("GitItemRow", () => {
  it("shows the details, leaving priority labels to the badge", () => {
    useGitStore.setState({ connected: true, issues: [issue("Bug", {
      priority: "high", iteration: "Sprint 2", milestone: "v1", labels: ["priority: high", "a", "b", "c"], dueDate: "2020-01-05",
    })] });
    render(<GitSection />);
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("⟳ Sprint 2")).toBeTruthy();
    expect(screen.getByText("· v1")).toBeTruthy();
    expect(screen.queryByText("priority: high")).toBeNull();
    expect(screen.getByText("b")).toBeTruthy();
    expect(screen.queryByText("c")).toBeNull();
    expect(screen.getByText(/Overdue · Jan 5/)).toBeTruthy();
  });

  it("shows a future date as due", () => {
    useGitStore.setState({ connected: true, issues: [issue("Bug", { dueDate: "2099-01-05" })] });
    render(<GitSection />);
    expect(screen.getByText(/Due Jan 5/)).toBeTruthy();
  });

  it("opens the issue in the browser", async () => {
    useGitStore.setState({ connected: true, issues: [issue("Bug")] });
    render(<GitSection />);
    await userEvent.click(screen.getByText("Bug"));
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("https://x/Bug"));
  });
});
