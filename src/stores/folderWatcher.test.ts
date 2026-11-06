import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autoExtractNote } from "../services/autoExtract";
import { ImportedFile, moveToProcessed, processFile, scanFolder } from "../services/folderWatcher";
import { createNote } from "../services/notes";
import { Note } from "../types";
import { useFolderWatcherStore } from "./folderWatcher";
import { useNotesStore } from "./notes";
import { useSettingsStore } from "./settings";

vi.mock("../services/autoExtract");
vi.mock("../services/folderWatcher");
vi.mock("../services/notes");
vi.mock("../services/store");

function imported(name: string, overrides: Partial<ImportedFile> = {}): ImportedFile {
  return { name, title: name, content: "Body", tags: ["watched-folder"], format: "txt", ...overrides };
}

function configure(overrides = {}) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getInitialState().settings,
      watchFolderEnabled: true,
      watchFolderPath: "/w",
      ...overrides,
    },
  });
}

const scanNow = (path?: string) => useFolderWatcherStore.getState().scanNow(path);
const state = () => useFolderWatcherStore.getState();

beforeEach(() => {
  useFolderWatcherStore.setState(useFolderWatcherStore.getInitialState(), true);
  useNotesStore.setState(useNotesStore.getInitialState(), true);
  configure();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(scanFolder).mockResolvedValue([]);
  vi.mocked(processFile).mockImplementation(async (_folder, name) => imported(name));
  let nextId = 1;
  vi.mocked(createNote).mockImplementation(async (n) => ({ ...n, id: `n${nextId++}`, createdAt: "c", updatedAt: "u" } as Note));
  vi.mocked(autoExtractNote).mockResolvedValue({ tasksCreated: 2, tasksSkipped: 0, summary: "" });
});

describe("when it scans", () => {
  it("does nothing while the watcher is off", async () => {
    configure({ watchFolderEnabled: false });
    expect(await scanNow()).toBe(0);
    expect(scanFolder).not.toHaveBeenCalled();
  });

  it("does nothing with no folder set", async () => {
    configure({ watchFolderPath: "" });
    expect(await scanNow()).toBe(0);
    expect(scanFolder).not.toHaveBeenCalled();
  });

  it("scans an explicit path even while the watcher is off", async () => {
    configure({ watchFolderEnabled: false });
    await scanNow("/other");
    expect(scanFolder).toHaveBeenCalledWith("/other");
  });

  it("skips a scan while another is still running", async () => {
    let finish!: (files: string[]) => void;
    vi.mocked(scanFolder).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

    const first = scanNow();
    expect(await scanNow()).toBe(0);
    expect(scanFolder).toHaveBeenCalledTimes(1);

    finish([]);
    await first;
    await scanNow();
    expect(scanFolder).toHaveBeenCalledTimes(2);
  });
});

describe("importing files", () => {
  it("creates a note, moves the file and updates the badge", async () => {
    vi.mocked(scanFolder).mockResolvedValue(["a.txt", "b.txt"]);

    expect(await scanNow()).toBe(2);

    expect(createNote).toHaveBeenCalledWith({ title: "a.txt", content: "Body", tags: ["watched-folder"], sourceType: "manual" });
    expect(moveToProcessed).toHaveBeenCalledWith("/w", "a.txt");
    expect(moveToProcessed).toHaveBeenCalledWith("/w", "b.txt");
    expect(state().newNoteCount).toBe(2);
    expect(state().recentImports).toEqual(["n2", "n1"]);
    expect(state().lastScanned).toBeInstanceOf(Date);
    expect(state().lastError).toBeNull();
  });

  it("keeps only the 20 most recent imports", async () => {
    useFolderWatcherStore.setState({ recentImports: Array.from({ length: 20 }, (_, i) => `old${i}`) });
    vi.mocked(scanFolder).mockResolvedValue(["a.txt"]);
    await scanNow();
    expect(state().recentImports).toHaveLength(20);
    expect(state().recentImports[0]).toBe("n1");
  });

  it("leaves a file it can't process in place and carries on", async () => {
    vi.mocked(scanFolder).mockResolvedValue(["bad.txt", "good.txt"]);
    vi.mocked(processFile).mockImplementation(async (_folder, name) => (name === "bad.txt" ? null : imported(name)));

    expect(await scanNow()).toBe(1);
    expect(moveToProcessed).toHaveBeenCalledTimes(1);
    expect(moveToProcessed).toHaveBeenCalledWith("/w", "good.txt");
  });

  it("records emails as transcript notes", async () => {
    vi.mocked(scanFolder).mockResolvedValue(["a.eml"]);
    vi.mocked(processFile).mockResolvedValue(imported("a.eml", { format: "eml" }));
    await scanNow();
    expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "transcript" }));
  });

  it("records VTT files as transcript notes", async () => {
    vi.mocked(scanFolder).mockResolvedValue(["a.vtt"]);
    vi.mocked(processFile).mockResolvedValue(imported("a.vtt", { format: "vtt" }));
    await scanNow();
    expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "transcript" }));
  });

  it("creates no note for a file it can't move, however many scans run", async () => {
    vi.mocked(scanFolder).mockResolvedValue(["a.txt"]);
    vi.mocked(moveToProcessed).mockRejectedValue(new Error("read-only"));
    expect(await scanNow()).toBe(0);
    await scanNow();
    expect(createNote).not.toHaveBeenCalled();
    expect(state().newNoteCount).toBe(0);
    expect(state().lastError).toBe("Could not move a.txt to _processed: read-only");
  });

  it("still imports the other files when one can't be moved", async () => {
    vi.mocked(scanFolder).mockResolvedValue(["stuck.txt", "good.txt"]);
    vi.mocked(moveToProcessed).mockImplementation(async (_folder, name) => {
      if (name === "stuck.txt") throw new Error("read-only");
    });
    expect(await scanNow()).toBe(1);
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ title: "good.txt" }));
  });
});

describe("errors", () => {
  it("records a failed scan and clears it after the next good one", async () => {
    vi.mocked(scanFolder).mockRejectedValueOnce(new Error("no access"));
    expect(await scanNow()).toBe(0);
    expect(state().lastError).toBe("no access");

    await scanNow();
    expect(state().lastError).toBeNull();
  });

  it("allows another scan after one fails", async () => {
    vi.mocked(scanFolder).mockRejectedValueOnce("offline");
    await scanNow();
    expect(state().lastError).toBe("offline");

    vi.mocked(scanFolder).mockResolvedValue(["a.txt"]);
    expect(await scanNow()).toBe(1);
  });
});

describe("last scanned time", () => {
  it("updates when the folder is empty", async () => {
    await scanNow();
    expect(state().lastScanned).toBeInstanceOf(Date);
  });
});

describe("auto-extract", () => {
  const aiConfigured = { watchFolderAutoExtract: true, bedrockProfile: "p", bedrockRegion: "r", bedrockModelId: "m" };

  it("is off unless enabled", async () => {
    vi.mocked(scanFolder).mockResolvedValue(["a.txt"]);
    await scanNow();
    expect(autoExtractNote).not.toHaveBeenCalled();
  });

  it("is skipped when AI isn't configured", async () => {
    configure({ ...aiConfigured, bedrockProfile: "" });
    vi.mocked(scanFolder).mockResolvedValue(["a.txt"]);
    await scanNow();
    expect(autoExtractNote).not.toHaveBeenCalled();
  });

  it("extracts from each note and counts the tasks", async () => {
    configure(aiConfigured);
    vi.mocked(scanFolder).mockResolvedValue(["a.txt", "b.txt"]);
    await scanNow();
    expect(autoExtractNote).toHaveBeenCalledWith(expect.objectContaining({ profile: "p" }), "n1", "a.txt", "Body", false);
    expect(state().tasksCreated).toBe(4);
  });

  it("tells extraction when a note is a transcript", async () => {
    configure(aiConfigured);
    vi.mocked(scanFolder).mockResolvedValue(["a.eml"]);
    vi.mocked(processFile).mockResolvedValue(imported("a.eml", { format: "eml" }));
    await scanNow();
    expect(vi.mocked(autoExtractNote).mock.lastCall![4]).toBe(true);
  });

  it("records a failure and still imports the remaining files", async () => {
    configure(aiConfigured);
    vi.mocked(scanFolder).mockResolvedValue(["a.txt", "b.txt"]);
    vi.mocked(autoExtractNote).mockRejectedValueOnce(new Error("denied"));

    expect(await scanNow()).toBe(2);
    expect(state().lastError).toBe("Auto-extract failed for a.txt: denied");
    expect(state().tasksCreated).toBe(2);
  });
});

describe("polling", () => {
  afterEach(() => {
    state().stopPolling();
    vi.useRealTimers();
  });

  it("scans right away, then every 30 seconds until stopped", async () => {
    vi.useFakeTimers();
    state().startPolling();
    expect(state().running).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(scanFolder).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(scanFolder).toHaveBeenCalledTimes(2);

    state().stopPolling();
    expect(state().running).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(scanFolder).toHaveBeenCalledTimes(2);
  });

  it("keeps a single timer when started twice", async () => {
    vi.useFakeTimers();
    state().startPolling();
    await vi.advanceTimersByTimeAsync(0);
    state().startPolling();
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(scanFolder).mockClear();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(scanFolder).toHaveBeenCalledTimes(1);
  });
});

describe("clearBadge", () => {
  it("resets the counts", () => {
    useFolderWatcherStore.setState({ newNoteCount: 3, tasksCreated: 2 });
    state().clearBadge();
    expect(state().newNoteCount).toBe(0);
    expect(state().tasksCreated).toBe(0);
  });
});
