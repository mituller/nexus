import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../services/wiki";
import { Note, WikiPage } from "../types";
import { useNotesStore } from "./notes";
import { useSettingsStore } from "./settings";
import { useWikiStore } from "./wiki";

vi.mock("../services/wiki");
vi.mock("../services/notes");
vi.mock("../services/store");

function page(id: string, title = id, overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    id, title, content: "", entityType: "general",
    tags: [], sourceIds: [], createdAt: "c", updatedAt: "u", ...overrides,
  };
}

beforeEach(() => {
  useWikiStore.setState(useWikiStore.getInitialState(), true);
  useNotesStore.setState(useNotesStore.getInitialState(), true);
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
});

describe("page mutations", () => {
  it("keeps pages sorted by title and activates a new page", async () => {
    useWikiStore.setState({ pages: [page("c", "Charlie")] });
    vi.mocked(db.createWikiPage).mockResolvedValue(page("a", "Alpha"));
    await useWikiStore.getState().create(page("a", "Alpha"));
    const { pages, activePageId } = useWikiStore.getState();
    expect(pages.map((p) => p.title)).toEqual(["Alpha", "Charlie"]);
    expect(activePageId).toBe("a");
  });

  it("replaces an existing page on upsert without changing the active page", async () => {
    useWikiStore.setState({ pages: [page("a", "Alpha", { content: "old" })], activePageId: null });
    vi.mocked(db.upsertWikiPageByTitle).mockResolvedValue(page("a", "Alpha", { content: "new" }));
    await useWikiStore.getState().upsertByTitle("Alpha", "general", "new", "n1");
    const { pages, activePageId } = useWikiStore.getState();
    expect(pages).toHaveLength(1);
    expect(pages[0].content).toBe("new");
    expect(activePageId).toBeNull();
  });

  it("inserts a new page on upsert in sorted position", async () => {
    useWikiStore.setState({ pages: [page("a", "Alpha"), page("c", "Charlie")] });
    vi.mocked(db.upsertWikiPageByTitle).mockResolvedValue(page("b", "Bravo"));
    await useWikiStore.getState().upsertByTitle("Bravo", "general", "x", "n1");
    expect(useWikiStore.getState().pages.map((p) => p.title)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("moves to the next page when the active one is removed", async () => {
    useWikiStore.setState({ pages: [page("a"), page("b")], activePageId: "a" });
    await useWikiStore.getState().remove("a");
    expect(useWikiStore.getState().activePageId).toBe("b");
  });

  it("re-queues source notes when a page is removed", async () => {
    const note: Note = {
      id: "n1", title: "N", content: "", tags: [], sourceType: "manual",
      wikiProcessedAt: "then", createdAt: "c", updatedAt: "u",
    };
    useNotesStore.setState({ notes: [note] });
    useWikiStore.setState({ pages: [page("a", "Alpha", { sourceIds: ["n1"] })] });
    await useWikiStore.getState().remove("a");
    await vi.waitFor(() => {
      expect(useNotesStore.getState().notes[0].wikiProcessedAt).toBeUndefined();
    });
  });
});

describe("category expansion", () => {
  const people = "person";

  it("treats an absent category as expanded, so the first toggle collapses it", () => {
    useWikiStore.getState().toggleCategory(people);
    expect(useWikiStore.getState().expandedCategories[people]).toBe(false);
    useWikiStore.getState().toggleCategory(people);
    expect(useWikiStore.getState().expandedCategories[people]).toBe(true);
  });

  it("persists a toggle to settings", () => {
    useWikiStore.getState().toggleCategory(people);
    expect(useSettingsStore.getState().settings.wikiExpandedCategories).toEqual({ [people]: false });
  });

  it("does not hydrate before settings have loaded", () => {
    useWikiStore.getState().hydrateExpanded();
    expect(useWikiStore.getState().hydratedExpanded).toBe(false);
  });

  it("hydrates once, without overwriting later changes", () => {
    useSettingsStore.setState({
      loaded: true,
      settings: { ...useSettingsStore.getState().settings, wikiExpandedCategories: { [people]: false } },
    });
    useWikiStore.getState().hydrateExpanded();
    expect(useWikiStore.getState().expandedCategories[people]).toBe(false);

    useWikiStore.getState().expandCategories([people]);
    useWikiStore.getState().hydrateExpanded();
    expect(useWikiStore.getState().expandedCategories[people]).toBe(true);
  });
});

describe("loading and saving", () => {
  it("loads the pages and stops loading", async () => {
    vi.mocked(db.getWikiPages).mockResolvedValue([page("a")]);
    await useWikiStore.getState().load();
    expect(useWikiStore.getState().pages).toEqual([page("a")]);
    expect(useWikiStore.getState().loading).toBe(false);
  });

  it("adds a new page in title order and opens it", async () => {
    useWikiStore.setState({ pages: [page("c", "Carol")] });
    vi.mocked(db.createWikiPage).mockResolvedValue(page("a", "Ann"));
    const draft = { title: "Ann", content: "", entityType: "general" as const, tags: [], sourceIds: [] };

    await useWikiStore.getState().create(draft);

    expect(useWikiStore.getState().pages.map((p) => p.title)).toEqual(["Ann", "Carol"]);
    expect(useWikiStore.getState().activePageId).toBe("a");
  });

  it("saves an edit and only changes that page", async () => {
    useWikiStore.setState({ pages: [page("a"), page("b")] });
    await useWikiStore.getState().update("a", { content: "New" });
    expect(db.updateWikiPage).toHaveBeenCalledWith("a", { content: "New" });
    expect(useWikiStore.getState().pages.map((p) => p.content)).toEqual(["New", ""]);
    expect(useWikiStore.getState().pages[0].updatedAt).not.toBe("u");
  });
});
