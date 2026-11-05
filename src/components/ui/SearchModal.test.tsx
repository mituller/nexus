// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGitStore } from "../../stores/git";
import { useNotesStore } from "../../stores/notes";
import { useTaskStore } from "../../stores/tasks";
import { useWikiStore } from "../../stores/wiki";
import { SearchModal } from "./SearchModal";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("../../services/db");
vi.mock("../../services/github");
vi.mock("../../services/gitlab");
vi.mock("../../services/notes");
vi.mock("../../services/store");
vi.mock("../../services/wiki");

const onClose = vi.fn();
const onNavigate = vi.fn();

function results() {
  return screen.queryAllByRole("button").filter((b) => /^(Note|Task|Wiki|Git)$/.test(b.lastElementChild?.textContent ?? ""));
}

async function search(text: string) {
  await userEvent.type(screen.getByPlaceholderText("Search notes, tasks, wiki, git…"), text);
}

beforeEach(() => {
  useNotesStore.setState({ notes: [
    { id: "n1", title: "Roadmap note", content: "# Plan\nDetails", tags: [], sourceType: "manual", createdAt: "c", updatedAt: "u" },
    { id: "n2", title: "Other", content: `${"x".repeat(50)} roadmap ${"y".repeat(100)}`, tags: [], sourceType: "manual", createdAt: "c", updatedAt: "u" },
  ] });
  useTaskStore.setState({ tasks: [
    { id: "t1", title: "Roadmap task", status: "open", priority: "high", tags: [], createdAt: "c", updatedAt: "u" },
    { id: "t2", title: "Call", description: "about the roadmap", status: "open", priority: "low", tags: [], createdAt: "c", updatedAt: "u" },
  ] });
  useWikiStore.setState({ pages: [
    { id: "p1", title: "Roadmap page", content: "## Goals", entityType: "project", tags: [], sourceIds: [], createdAt: "c", updatedAt: "u" },
  ] });
  useGitStore.setState({ issues: [
    { id: "g1", iid: 5, title: "Roadmap issue", state: "opened", webUrl: "https://x/5", projectName: "app", projectPath: "acme/app", labels: [], issueType: "issue", createdAt: "c", updatedAt: "u", provider: "github" },
  ] });
  render(<SearchModal onClose={onClose} onNavigate={onNavigate} />);
});

afterEach(cleanup);

describe("searching", () => {
  it("starts focused, with a prompt", () => {
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Search notes, tasks, wiki, git…"));
    expect(screen.getByText("Search notes, tasks, wiki, and git items.")).toBeTruthy();
  });

  it("finds notes, tasks, wiki pages and issues, ignoring case", async () => {
    await search("ROADMAP");
    expect(await screen.findByText("6 results")).toBeTruthy();
    expect(results().map((r) => r.lastElementChild?.textContent)).toEqual(["Note", "Note", "Task", "Task", "Wiki", "Git"]);
  });

  it("shortens long matches around the search term", async () => {
    await search("roadmap");
    expect(await screen.findByText(`…${"x".repeat(19)} roadmap ${"y".repeat(52)}…`)).toBeTruthy();
  });

  it("removes markdown heading marks from excerpts", async () => {
    await search("Goals");
    expect(await screen.findByText("Goals")).toBeTruthy();
    expect(screen.queryByText("## Goals")).toBeNull();
  });

  it("highlights the match in the title", async () => {
    await search("road");
    const mark = await screen.findAllByText("Road");
    expect(mark[0].tagName).toBe("MARK");
  });

  it("treats special characters as text", async () => {
    await search("road(");
    expect(await screen.findByText('No results for "road("')).toBeTruthy();
  });

  it("clears with the X button", async () => {
    await search("road");
    await screen.findByText("6 results");
    const input = screen.getByPlaceholderText("Search notes, tasks, wiki, git…") as HTMLInputElement;
    await userEvent.click(input.parentElement!.querySelector("button")!);
    expect(input.value).toBe("");
  });
});

describe("opening a result", () => {
  it("navigates to a clicked note and closes", async () => {
    await search("Roadmap note");
    await screen.findByText("1 result");
    await userEvent.click(results()[0]);
    expect(onNavigate).toHaveBeenCalledWith("note", "n1");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens an issue in the browser instead of navigating", async () => {
    await search("Roadmap issue");
    await screen.findByText("1 result");
    await userEvent.click(results()[0]);
    expect(openUrl).toHaveBeenCalledWith("https://x/5");
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("moves with the arrow keys, staying in range, and opens with Enter", async () => {
    await search("roadmap");
    await screen.findByText("6 results");
    await userEvent.keyboard("{ArrowUp}{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}{ArrowDown}{Enter}");
    expect(onNavigate).toHaveBeenCalledWith("task", "t2");
  });

  it("stops at the last result", async () => {
    await search("roadmap");
    await screen.findByText("6 results");
    await userEvent.keyboard(`${"{ArrowDown}".repeat(10)}{Enter}`);
    expect(openUrl).toHaveBeenCalledWith("https://x/5");
  });

  it("does nothing on Enter with no results", async () => {
    await search("nothing here");
    await screen.findByText('No results for "nothing here"');
    await userEvent.keyboard("{Enter}");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("closes on Escape and on an outside click, not an inside one", async () => {
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText("Search notes, tasks, wiki, and git items."));
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = screen.getByPlaceholderText("Search notes, tasks, wiki, git…").closest(".fixed")!;
    await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // The key handler is on the panel, so clicking a non-focusable part of it
  // moves focus to the page and the keys stop reaching the handler.
  it.fails("KNOWN BUG: Escape still closes after clicking inside the panel", async () => {
    await userEvent.click(screen.getByText("Search notes, tasks, wiki, and git items."));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
