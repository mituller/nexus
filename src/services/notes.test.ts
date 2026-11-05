import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNote, getNoteById, getNotes, updateNote } from "./notes";

const fake = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: async () => fake },
}));

beforeEach(() => {
  fake.select.mockResolvedValue([]);
  fake.execute.mockResolvedValue(undefined);
});

const row = {
  id: "n1",
  title: "Title",
  content: "Body",
  tags: '["a"]',
  linked_event_id: null,
  linked_event_title: null,
  source_type: "manual",
  extracted_at: null,
  wiki_processed_at: "2026-06-01T00:00:00Z",
  created_at: "c",
  updated_at: "u",
};

describe("reading notes", () => {
  it("maps a row to a Note", async () => {
    fake.select.mockResolvedValue([row]);
    expect(await getNotes()).toEqual([{
      id: "n1",
      title: "Title",
      content: "Body",
      tags: ["a"],
      linkedEventId: undefined,
      linkedEventTitle: undefined,
      sourceType: "manual",
      extractedAt: undefined,
      wikiProcessedAt: "2026-06-01T00:00:00Z",
      createdAt: "c",
      updatedAt: "u",
    }]);
  });

  it("returns null for an unknown id", async () => {
    expect(await getNoteById("missing")).toBeNull();
  });
});

describe("createNote", () => {
  it("stores tags as JSON and absent links as null", async () => {
    const created = await createNote({ title: "T", content: "C", tags: ["x"], sourceType: "manual" });
    const [, params] = fake.execute.mock.lastCall as [string, unknown[]];
    expect(params.slice(0, 7)).toEqual([created.id, "T", "C", '["x"]', null, null, "manual"]);
  });
});

describe("updateNote", () => {
  it("re-queues the note for wiki ingest when content changes", async () => {
    await updateNote("n1", { content: "New" });
    const [sql] = fake.execute.mock.lastCall as [string];
    expect(sql).toContain("wiki_processed_at = NULL");
  });

  it("does not re-queue when only the title changes", async () => {
    await updateNote("n1", { title: "New" });
    const [sql] = fake.execute.mock.lastCall as [string];
    expect(sql).not.toContain("wiki_processed_at");
  });

  it("numbers placeholders correctly around the literal NULL", async () => {
    await updateNote("n1", { content: "New", tags: ["a"] });
    const [sql, params] = fake.execute.mock.lastCall as [string, unknown[]];
    expect(sql).toBe("UPDATE notes SET content = $1, wiki_processed_at = NULL, tags = $2, updated_at = $3 WHERE id = $4");
    expect(params[0]).toBe("New");
    expect(params[3]).toBe("n1");
  });
});
