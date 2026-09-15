import { create } from "zustand";
import { useSettingsStore } from "./settings";
import { useNotesStore } from "./notes";
import { scanFolder, processFile, moveToProcessed } from "../services/folderWatcher";
import { autoExtractNote } from "../services/autoExtract";
import { hasBedrockConfig } from "../services/claude";

interface FolderWatcherStore {
  running: boolean;
  newNoteCount: number;       // badge: notes imported since last viewed
  lastScanned: Date | null;
  lastError: string | null;   // surfaced in Settings so failures aren't silent
  tasksCreated: number;       // tasks auto-extracted since last badge clear
  recentImports: string[];    // note IDs of recently imported files
  clearBadge: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  /** Pass a path to scan a folder that hasn't been saved to settings yet. */
  scanNow: (overridePath?: string) => Promise<number>;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;
// Auto-extract makes a Bedrock call per file, so a scan can outlast the
// 30s poll interval. Guard against overlapping scans.
let scanInFlight = false;

export const useFolderWatcherStore = create<FolderWatcherStore>((set, get) => ({
  running: false,
  newNoteCount: 0,
  lastScanned: null,
  lastError: null,
  tasksCreated: 0,
  recentImports: [],

  clearBadge: () => set({ newNoteCount: 0, tasksCreated: 0 }),

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

  scanNow: async (overridePath?: string) => {
    const { settings } = useSettingsStore.getState();
    // An explicit path (from the Settings form) scans even when the toggle is off.
    const folderPath = overridePath || settings.watchFolderPath;
    if (!folderPath) return 0;
    if (!overridePath && !settings.watchFolderEnabled) return 0;
    if (scanInFlight) return 0;
    scanInFlight = true;

    try {
      const files = await scanFolder(folderPath);
      set({ lastError: null });
      if (files.length === 0) return 0;

      const { create: createNote } = useNotesStore.getState();
      const cfg = {
        profile: settings.bedrockProfile,
        region: settings.bedrockRegion,
        modelId: settings.bedrockModelId,
      };
      let imported = 0;

      for (const fileName of files) {
        const result = await processFile(folderPath, fileName);
        if (!result) continue;

        // Create note
        const note = await createNote({
          title: result.title,
          content: result.content,
          tags: result.tags,
          sourceType: result.format === "eml" ? "transcript" : "manual",
        });

        // Move to _processed
        await moveToProcessed(folderPath, fileName);

        set((state) => ({
          newNoteCount: state.newNoteCount + 1,
          recentImports: [note.id, ...state.recentImports].slice(0, 20),
        }));
        imported++;

        // Auto-extract tasks with AI, if enabled. A failure here must not
        // abort the rest of the import — the note is already saved.
        if (settings.watchFolderAutoExtract && hasBedrockConfig(cfg)) {
          try {
            const { tasksCreated } = await autoExtractNote(
              cfg,
              note.id,
              note.title,
              note.content,
              note.sourceType === "transcript"
            );
            set((state) => ({ tasksCreated: state.tasksCreated + tasksCreated }));
          } catch (e) {
            console.error(`Auto-extract failed for ${fileName}:`, e);
            set({ lastError: `Auto-extract failed for ${fileName}: ${e instanceof Error ? e.message : String(e)}` });
          }
        }
      }

      set({ lastScanned: new Date() });
      return imported;
    } catch (e) {
      console.error("Folder scan failed:", e);
      set({ lastError: e instanceof Error ? e.message : String(e) });
      return 0;
    } finally {
      scanInFlight = false;
    }
  },
}));
