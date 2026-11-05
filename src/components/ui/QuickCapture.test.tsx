// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask } from "../../services/db";
import { createNote } from "../../services/notes";
import { useNotesStore } from "../../stores/notes";
import { Note, Task } from "../../types";
import { QuickCapture } from "./QuickCapture";

vi.mock("../../services/db");
vi.mock("../../services/notes");

const onClose = vi.fn();
const onNavigate = vi.fn();

beforeEach(() => {
  vi.mocked(createTask).mockImplementation(async (t) => ({ ...t, id: "t1", createdAt: "c", updatedAt: "u" } as Task));
  vi.mocked(createNote).mockImplementation(async (n) => ({ ...n, id: "n1", createdAt: "c", updatedAt: "u" } as Note));
  useNotesStore.setState(useNotesStore.getInitialState(), true);
  render(<QuickCapture onClose={onClose} onNavigate={onNavigate} />);
});

afterEach(cleanup);

describe("QuickCapture", () => {
  it("starts on a focused, empty task", () => {
    const input = screen.getByPlaceholderText("What needs to be done?");
    expect(document.activeElement).toBe(input);
    expect((screen.getByRole("button", { name: "Add task" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds a task with the chosen priority, then goes to Tasks", async () => {
    await userEvent.type(screen.getByPlaceholderText("What needs to be done?"), "  Call Ann  ");
    await userEvent.click(screen.getByRole("button", { name: "high" }));
    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("tasks"));
    expect(createTask).toHaveBeenCalledWith({ title: "Call Ann", status: "open", priority: "high", tags: [] });
    expect(onClose).toHaveBeenCalled();
  });

  it("creates a note, opens it and goes to Notes", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.queryByRole("button", { name: "high" })).toBeNull();

    await userEvent.type(screen.getByPlaceholderText("Note title…"), "Ideas{Enter}");

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("notes"));
    expect(createNote).toHaveBeenCalledWith({ title: "Ideas", content: "", tags: [], sourceType: "manual" });
    expect(useNotesStore.getState().activeNoteId).toBe("n1");
    expect(createTask).not.toHaveBeenCalled();
  });

  it("switches mode with ⌘1 and ⌘2", async () => {
    await userEvent.keyboard("{Meta>}2{/Meta}");
    expect(screen.getByPlaceholderText("Note title…")).toBeTruthy();
    await userEvent.keyboard("{Meta>}1{/Meta}");
    expect(screen.getByPlaceholderText("What needs to be done?")).toBeTruthy();
  });

  it("closes on Escape and on an outside click, not an inside one", async () => {
    const input = screen.getByPlaceholderText("What needs to be done?");
    await userEvent.click(input);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(input.closest(".fixed")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("removes its key listener when closed", async () => {
    cleanup();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
