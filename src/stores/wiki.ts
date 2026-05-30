import { create } from "zustand";
import { WikiPage, WikiEntityType } from "../types";
import * as db from "../services/wiki";

interface WikiStore {
  pages: WikiPage[];
  activePageId: string | null;
  loading: boolean;
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
    await db.deleteWikiPage(id);
    const remaining = get().pages.filter((p) => p.id !== id);
    set({
      pages: remaining,
      activePageId: get().activePageId === id ? (remaining[0]?.id ?? null) : get().activePageId,
    });
  },

  setActive: (id) => set({ activePageId: id }),
}));
