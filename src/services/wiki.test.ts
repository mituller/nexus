import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWikiPage, deleteWikiPage, getUnprocessedNotes, getWikiPageByTitle, getWikiPages,
  markNoteWikiProcessed, searchWikiPages, updateWikiPage, upsertWikiPageByTitle,
} from "./wiki";

const fake = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: async () => fake },
}));

beforeEach(() => {
  fake.select.mockResolvedValue([]);
  fake.execute.mockResolvedValue(undefined);
});

const row = {
  id: "p1",
  title: "Ann",
  content: "Body",
  entity_type: "person",
  tags: '["a"]',
  source_ids: '["n1"]',
  created_at: "c",
  updated_at: "u",
};

describe("reading pages", () => {
  it("maps rows to pages, parsing the JSON columns", async () => {
    fake.select.mockResolvedValue([row]);
    expect(await getWikiPages()).toEqual([{
      id: "p1", title: "Ann", content: "Body", entityType: "person",
      tags: ["a"], sourceIds: ["n1"], createdAt: "c", updatedAt: "u",
    }]);
  });

  it("treats empty JSON columns as empty lists", async () => {
    fake.select.mockResolvedValue([{ ...row, tags: "", source_ids: null }]);
    const [page] = await getWikiPages();
    expect(page.tags).toEqual([]);
    expect(page.sourceIds).toEqual([]);
  });

  it("finds a page by title, or returns null", async () => {
    expect(await getWikiPageByTitle("Nobody")).toBeNull();
    fake.select.mockResolvedValue([row]);
    expect((await getWikiPageByTitle("ann"))?.id).toBe("p1");
    expect(fake.select.mock.lastCall![0]).toContain("COLLATE NOCASE");
    expect(fake.select.mock.lastCall![1]).toEqual(["ann"]);
  });

  it("searches with a LIKE pattern", async () => {
    await searchWikiPages("road");
    expect(fake.select.mock.lastCall![1]).toEqual(["%road%"]);
  });
});

describe("createWikiPage", () => {
  it("stores the lists as JSON and returns the new page", async () => {
    const page = await createWikiPage({ title: "Ann", content: "Body", entityType: "person", tags: ["a"], sourceIds: ["n1"] });
    const values = fake.execute.mock.lastCall![1];
    expect(values[0]).toBe(page.id);
    expect(values.slice(1, 6)).toEqual(["Ann", "Body", "person", '["a"]', '["n1"]']);
    expect(page.createdAt).toBe(page.updatedAt);
  });
});

describe("updateWikiPage", () => {
  it("updates only the fields given, with the id last", async () => {
    await updateWikiPage("p1", { content: "New" });
    const [sql, values] = fake.execute.mock.lastCall!;
    expect(sql).toBe("UPDATE wiki_pages SET content = $1, updated_at = $2 WHERE id = $3");
    expect(values[0]).toBe("New");
    expect(values[2]).toBe("p1");
  });

  it("numbers every field in order", async () => {
    await updateWikiPage("p1", { title: "T", content: "C", entityType: "project", tags: ["x"], sourceIds: ["n2"] });
    const [sql, values] = fake.execute.mock.lastCall!;
    expect(sql).toBe(
      "UPDATE wiki_pages SET title = $1, content = $2, entity_type = $3, tags = $4, source_ids = $5, updated_at = $6 WHERE id = $7"
    );
    expect(values.slice(0, 5)).toEqual(["T", "C", "project", '["x"]', '["n2"]']);
    expect(values[6]).toBe("p1");
  });
});

describe("upsertWikiPageByTitle", () => {
  it("creates the page when the title is new", async () => {
    const page = await upsertWikiPageByTitle("Ann", "person", "Body", "n1");
    expect(fake.execute.mock.lastCall![0]).toContain("INSERT INTO wiki_pages");
    expect(page.sourceIds).toEqual(["n1"]);
  });

  it("updates the existing page and adds the source only once", async () => {
    fake.select.mockResolvedValue([row]);
    const again = await upsertWikiPageByTitle("Ann", "person", "New", "n1");
    expect(again.sourceIds).toEqual(["n1"]);

    const added = await upsertWikiPageByTitle("Ann", "person", "New", "n2");
    expect(added.id).toBe("p1");
    expect(added.content).toBe("New");
    expect(added.sourceIds).toEqual(["n1", "n2"]);
    expect(fake.execute.mock.lastCall![0]).toContain("UPDATE wiki_pages");
  });
});

describe("deleteWikiPage", () => {
  it("queues each source note for ingest again, then deletes the page", async () => {
    fake.select.mockResolvedValue([{ source_ids: '["n1","n2"]' }]);
    await deleteWikiPage("p1");

    const calls = fake.execute.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toContain("wiki_processed_at = NULL");
    expect(calls[0][1][1]).toBe("n1");
    expect(calls[1][1][1]).toBe("n2");
    expect(calls[2]).toEqual(["DELETE FROM wiki_pages WHERE id = $1", ["p1"]]);
  });

  it("still deletes when the page isn't found", async () => {
    await deleteWikiPage("p1");
    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect(fake.execute.mock.lastCall![0]).toContain("DELETE FROM wiki_pages");
  });
});

describe("note processing", () => {
  it("records when a note was processed", async () => {
    await markNoteWikiProcessed("n1");
    const [sql, values] = fake.execute.mock.lastCall!;
    expect(sql).toContain("wiki_processed_at = $1");
    expect(values[1]).toBe("n1");
  });

  it("lists only id, title and content for unprocessed notes", async () => {
    fake.select.mockResolvedValue([{ id: "n1", title: "T", content: "C", extra: "ignored" }]);
    expect(await getUnprocessedNotes()).toEqual([{ id: "n1", title: "T", content: "C" }]);
    expect(fake.select.mock.lastCall![0]).toContain("wiki_processed_at IS NULL");
  });
});
