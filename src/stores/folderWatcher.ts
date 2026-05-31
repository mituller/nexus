import { create } from "zustand";
import { useSettingsStore } from "./settings";
import { useNotesStore } from "./notes";
import { scanFolder, processFile, moveToProcessed } from "../services/folderWatcher";

interface FolderWatcherStore {
  running: boolean;
  newNoteCount: number;       // badge: notes imported since last viewed
  lastScanned: Date | null;
  recentImports: string[];    // note IDs of recently imported files
  clearBadge: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  scanNow: () => Promise<number>;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

export const useFolderWatcherStore = create<FolderWatcherStore>((set, get) => ({
  running: false,
  newNoteCount: 0,
  lastScanned: null,
  recentImports: [],

  clearBadge: () => set({ newNoteCount: 0 }),

  startPolling: () => {
    if (pollingTimer) clearInterval(pollingTimer);
    set({ running: true });
    // Scan immediately, then every 30 seconds
    get().scanNow();
    pollingTimer = setInterval(() => get().scanNow(), 30_000);
  },

  stopPolling: () => {
    if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
    set({ running: false });
  },

  scanNow: async () => {
    const { settings } = useSettingsStore.getState();
    if (!settings.watchFolderEnabled || !settings.watchFolderPath) return 0;

    try {
      const files = await scanFolder(settings.watchFolderPath);
      if (files.length === 0) return 0;

      const { create: createNote } = useNotesStore.getState();
      let imported = 0;

      for (const fileName of files) {
        const result = await processFile(settings.watchFolderPath, fileName);
        if (!result) continue;

        // Create note
        const note = await createNote({
          title: result.title,
          content: result.content,
          tags: result.tags,
          sourceType: result.format === "eml" ? "transcript" : "manual",
        });

        // Move to _processed
        await moveToProcessed(settings.watchFolderPath, fileName);

        set((state) => ({
          newNoteCount: state.newNoteCount + 1,
          recentImports: [note.id, ...state.recentImports].slice(0, 20),
        }));
        imported++;
      }

      set({ lastScanned: new Date() });
      return imported;
    } catch (e) {
      console.error("Folder scan failed:", e);
      return 0;
    }
  },
}));
