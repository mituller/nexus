import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../services/notes";
import { Note } from "../types";
import { useNotesStore } from "./notes";

vi.mock("../services/notes");

function note(id: string, overrides: Partial<Note> = {}): Note {
  return { id, title: id, content: "body", tags: [], sourceType: "manual", createdAt: "c", updatedAt: "u", ...overrides };
}

beforeEach(() => {
  useNotesStore.setState(useNotesStore.getInitialState(), true);
});

describe("useNotesStore", () => {
  it("makes a new note first and active", async () => {
    useNotesStore.setState({ notes: [note("old")] });
    vi.mocked(db.createNote).mockResolvedValue(note("new"));
    await useNotesStore.getState().create({ title: "new", content: "", tags: [], sourceType: "manual" });
    const { notes, activeNoteId } = useNotesStore.getState();
    expect(notes.map((n) => n.id)).toEqual(["new", "old"]);
    expect(activeNoteId).toBe("new");
  });

  it("clears wikiProcessedAt when content changes", async () => {
    useNotesStore.setState({ notes: [note("a", { wikiProcessedAt: "then" })] });
    await useNotesStore.getState().update("a", { content: "new" });
    const [n] = useNotesStore.getState().notes;
    expect(n.content).toBe("new");
    expect(n.wikiProcessedAt).toBeUndefined();
    expect(n.updatedAt).not.toBe("u");
  });

  it("keeps wikiProcessedAt when only the title changes", async () => {
    useNotesStore.setState({ notes: [note("a", { wikiProcessedAt: "then" })] });
    await useNotesStore.getState().update("a", { title: "new" });
    expect(useNotesStore.getState().notes[0].wikiProcessedAt).toBe("then");
  });

  it("moves to the next note when the active one is removed", async () => {
    useNotesStore.setState({ notes: [note("a"), note("b")], activeNoteId: "a" });
    await useNotesStore.getState().remove("a");
    expect(useNotesStore.getState().activeNoteId).toBe("b");
  });

  it("has no active note after removing the last one", async () => {
    useNotesStore.setState({ notes: [note("a")], activeNoteId: "a" });
    await useNotesStore.getState().remove("a");
    expect(useNotesStore.getState().activeNoteId).toBeNull();
  });

  it("keeps the active note when another is removed", async () => {
    useNotesStore.setState({ notes: [note("a"), note("b")], activeNoteId: "a" });
    await useNotesStore.getState().remove("b");
    expect(useNotesStore.getState().activeNoteId).toBe("a");
  });
});
