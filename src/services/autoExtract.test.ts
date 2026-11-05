import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotesStore } from "../stores/notes";
import { useTaskStore } from "../stores/tasks";
import { BedrockConfig, Task } from "../types";
import { autoExtractNote } from "./autoExtract";
import { extractFromNote } from "./claude";
import { createTask } from "./db";
import { linkNoteTask, markNoteExtracted, updateNote } from "./notes";

vi.mock("./claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./claude")>()),
  extractFromNote: vi.fn(),
}));
vi.mock("./db");
vi.mock("./notes");

const cfg: BedrockConfig = {
  provider: "bedrock", profile: "p", region: "r", modelId: "m", openRouterApiKey: "", openRouterModel: "",
};

function extracted(...titles: string[]) {
  return {
    tasks: titles.map((title) => ({ title, priority: "high" as const, dueDate: "2026-07-01", tags: ["x"] })),
    summary: "Sum",
    entities: [],
  };
}

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  useNotesStore.setState(useNotesStore.getInitialState(), true);
  vi.mocked(createTask).mockImplementation(async (t) => ({ ...t, id: `id-${t.title}`, createdAt: "c", updatedAt: "u" } as Task));
});

describe("autoExtractNote", () => {
  it("refuses to run with no AI config", async () => {
    await expect(autoExtractNote({ ...cfg, profile: "" }, "n1", "T", "C", false)).rejects.toThrow("AI is not configured");
    expect(extractFromNote).not.toHaveBeenCalled();
  });

  it("creates each task as a transcript task linked to the note", async () => {
    vi.mocked(extractFromNote).mockResolvedValue(extracted("Book the venue", "Send the invoice"));

    const result = await autoExtractNote(cfg, "n1", "T", "C", true);

    expect(extractFromNote).toHaveBeenCalledWith(cfg, "T", "C", true);
    expect(result).toEqual({ tasksCreated: 2, tasksSkipped: 0, summary: "Sum" });
    expect(createTask).toHaveBeenCalledWith({
      title: "Book the venue", status: "open", priority: "high", dueDate: "2026-07-01",
      tags: ["x"], sourceType: "transcript", sourceId: "n1",
    });
    expect(linkNoteTask).toHaveBeenCalledWith("n1", "id-Book the venue");
    expect(linkNoteTask).toHaveBeenCalledWith("n1", "id-Send the invoice");
  });

  it("skips a task that already exists", async () => {
    useTaskStore.setState({ tasks: [{ id: "t", title: "Book the venue", status: "open", priority: "low", tags: [], createdAt: "c", updatedAt: "u" }] });
    vi.mocked(extractFromNote).mockResolvedValue(extracted("Book the venue"));

    expect(await autoExtractNote(cfg, "n1", "T", "C", false)).toMatchObject({ tasksCreated: 0, tasksSkipped: 1 });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("removes duplicates within one extraction", async () => {
    vi.mocked(extractFromNote).mockResolvedValue(extracted("Book the venue", "Book the venue"));
    expect(await autoExtractNote(cfg, "n1", "T", "C", false)).toMatchObject({ tasksCreated: 1, tasksSkipped: 1 });
  });

  it("marks the note as extracted, even with no tasks", async () => {
    useNotesStore.setState({ notes: [{ id: "n1", title: "T", content: "C", tags: [], sourceType: "manual", createdAt: "c", updatedAt: "u" }] });
    vi.mocked(extractFromNote).mockResolvedValue(extracted());

    await autoExtractNote(cfg, "n1", "T", "C", false);

    expect(markNoteExtracted).toHaveBeenCalledWith("n1");
    expect(updateNote).toHaveBeenCalledWith("n1", { extractedAt: expect.any(String) });
    expect(useNotesStore.getState().notes[0].extractedAt).toBeTruthy();
  });

  it("doesn't mark the note when the AI call fails, so it can be retried", async () => {
    vi.mocked(extractFromNote).mockRejectedValue(new Error("denied"));
    await expect(autoExtractNote(cfg, "n1", "T", "C", false)).rejects.toThrow("denied");
    expect(markNoteExtracted).not.toHaveBeenCalled();
  });
});
