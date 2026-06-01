import { create } from "zustand";
import { Note } from "../types";
import * as db from "../services/notes";

interface NotesStore {
  notes: Note[];
  activeNoteId: string | null;
  loading: boolean;
  load: () => Promise<void>;
  create: (note: Omit<Note, "id" | "createdAt" | "updatedAt">) => Promise<Note>;
  update: (id: string, updates: Partial<Omit<Note, "id" | "createdAt">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: [],
  activeNoteId: null,
  loading: false,

  load: async () => {
    set({ loading: true });
    const notes = await db.getNotes();
    set({ notes, loading: false });
  },

  create: async (note) => {
    const created = await db.createNote(note);
    set({ notes: [created, ...get().notes], activeNoteId: created.id });
    return created;
  },

  update: async (id, updates) => {
    await db.updateNote(id, updates);
    set({
      notes: get().notes.map((n) => {
        if (n.id !== id) return n;
        // If content changed, clear wikiProcessedAt so it re-queues for ingest
        const wikiReset = updates.content !== undefined ? { wikiProcessedAt: undefined } : {};
        return { ...n, ...updates, ...wikiReset, updatedAt: new Date().toISOString() };
      }),
    });
  },

  remove: async (id) => {
    await db.deleteNote(id);
    const remaining = get().notes.filter((n) => n.id !== id);
    set({
      notes: remaining,
      activeNoteId: get().activeNoteId === id ? (remaining[0]?.id ?? null) : get().activeNoteId,
    });
  },

  setActive: (id) => set({ activeNoteId: id }),
}));
