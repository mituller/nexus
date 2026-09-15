import { create } from "zustand";
import { WikiPage, WikiEntityType } from "../types";
import * as db from "../services/wiki";
import { useSettingsStore } from "./settings";

interface WikiStore {
  pages: WikiPage[];
  activePageId: string | null;
  loading: boolean;
  expandedCategories: Partial<Record<WikiEntityType, boolean>>;
  hydratedExpanded: boolean;
  hydrateExpanded: () => void;
  toggleCategory: (type: WikiEntityType) => void;
  expandCategories: (types: WikiEntityType[]) => void;
  load: () => Promise<void>;
  create: (page: Omit<WikiPage, "id" | "createdAt" | "updatedAt">) => Promise<WikiPage>;
  update: (id: string, updates: Partial<Omit<WikiPage, "id" | "createdAt">>) => Promise<void>;
  upsertByTitle: (title: string, entityType: WikiEntityType, content: string, sourceId: string) => Promise<WikiPage>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
}

export const useWikiStore = create<WikiStore>((set, get) => ({
  pages: [],
  activePageId: null,
  loading: false,
  // Absent key means expanded; see CATEGORY_DEFAULT_OPEN in WikiPageList.
  expandedCategories: {},
  hydratedExpanded: false,

  // Settings load asynchronously, so pull the saved collapse state in once it's ready.
  hydrateExpanded: () => {
    if (get().hydratedExpanded) return;
    const { settings, loaded } = useSettingsStore.getState();
    if (!loaded) return;
    set({ expandedCategories: settings.wikiExpandedCategories ?? {}, hydratedExpanded: true });
  },

  toggleCategory: (type) => {
    const current = get().expandedCategories[type] ?? true;
    const next = { ...get().expandedCategories, [type]: !current };
    set({ expandedCategories: next });
    // Persist so the choice survives a restart
    void useSettingsStore.getState().update({ wikiExpandedCategories: next });
  },

  expandCategories: (types) => {
    const patch: Partial<Record<WikiEntityType, boolean>> = {};
    for (const t of types) patch[t] = true;
    set((s) => ({ expandedCategories: { ...s.expandedCategories, ...patch } }));
  },

  load: async () => {
    set({ loading: true });
    const pages = await db.getWikiPages();
    set({ pages, loading: false });
  },

  create: async (page) => {
    const created = await db.createWikiPage(page);
    set({ pages: [...get().pages, created].sort((a, b) => a.title.localeCompare(b.title)), activePageId: created.id });
    return created;
  },

  update: async (id, updates) => {
    await db.updateWikiPage(id, updates);
    set({
      pages: get().pages.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      ),
    });
  },

  upsertByTitle: async (title, entityType, content, sourceId) => {
    const page = await db.upsertWikiPageByTitle(title, entityType, content, sourceId);
    const existing = get().pages.find((p) => p.id === page.id);
    if (existing) {
      set({ pages: get().pages.map((p) => (p.id === page.id ? page : p)) });
    } else {
      set({ pages: [...get().pages, page].sort((a, b) => a.title.localeCompare(b.title)) });
    }
    return page;
  },

  remove: async (id) => {
    // Get source note IDs before deletion (deleteWikiPage resets wiki_processed_at in DB)
    const page = get().pages.find((p) => p.id === id);
    await db.deleteWikiPage(id);
    // Reflect wiki_processed_at reset in the notes store so badge updates immediately
    if (page?.sourceIds.length) {
      const { useNotesStore } = await import("./notes");
      const { update: updateNote } = useNotesStore.getState();
      for (const noteId of page.sourceIds) {
        updateNote(noteId, { wikiProcessedAt: undefined });
      }
    }
    const remaining = get().pages.filter((p) => p.id !== id);
    set({
      pages: remaining,
      activePageId: get().activePageId === id ? (remaining[0]?.id ?? null) : get().activePageId,
    });
  },

  setActive: (id) => set({ activePageId: id }),
}));
