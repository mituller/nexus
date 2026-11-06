import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, readDir, readTextFile, rename } from "@tauri-apps/plugin-fs";
import { moveToProcessed, processFile, scanFolder } from "./folderWatcher";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(), mkdir: vi.fn(), readDir: vi.fn(), readTextFile: vi.fn(), rename: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("processFile", () => {
  it("ignores unsupported files without reading them", async () => {
    expect(await processFile("/w", "photo.png")).toBeNull();
    expect(await processFile("/w", "no-extension")).toBeNull();
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("uses the email's subject as the title", async () => {
    vi.mocked(readTextFile).mockResolvedValue("Subject: Quarterly plan\nFrom: a@x.com\nContent-Type: text/plain\n\nHello");
    const file = await processFile("/w", "mail.eml");
    expect(readTextFile).toHaveBeenCalledWith("/w/mail.eml");
    expect(file).toMatchObject({ name: "mail.eml", title: "Quarterly plan", format: "eml", tags: ["email", "watched-folder"] });
    expect(file?.content).toContain("Hello");
  });

  it("uses the parser's placeholder for an email with no subject", async () => {
    vi.mocked(readTextFile).mockResolvedValue("From: a@x.com\n\nHello");
    expect((await processFile("/w", "weekly_mail.eml"))?.title).toBe("(No subject)");
  });

  it("cleans transcripts", async () => {
    vi.mocked(readTextFile).mockResolvedValue("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Ann>Hi");
    expect(await processFile("/w", "standup.vtt")).toMatchObject({
      title: "standup", content: "**Ann** (0:01): Hi", format: "vtt", tags: ["transcript", "watched-folder"],
    });
  });

  it.each(["a.txt", "a.text", "a.md", "A.TXT"])("reads %s as plain text", async (name) => {
    vi.mocked(readTextFile).mockResolvedValue("Body");
    expect(await processFile("/w", name)).toMatchObject({ content: "Body", format: "txt", tags: ["watched-folder"] });
  });

  it("makes a readable title from the file name", async () => {
    vi.mocked(readTextFile).mockResolvedValue("Body");
    expect((await processFile("/w", "q3_plan-final.v2.txt"))?.title).toBe("q3 plan final.v2");
  });

  it.each(["docx", "doc", "rtf"])("extracts .%s through textutil", async (ext) => {
    vi.mocked(invoke).mockResolvedValue("Text");
    expect(await processFile("/w", `a.${ext}`)).toMatchObject({ content: "Text", format: ext, tags: ["document", "watched-folder"] });
    expect(invoke).toHaveBeenCalledWith("extract_text_from_file", { path: `/w/a.${ext}` });
  });

  it("extracts PDFs, with a placeholder when that fails", async () => {
    vi.mocked(invoke).mockResolvedValueOnce("Text");
    expect(await processFile("/w", "a.pdf")).toMatchObject({ content: "Text", tags: ["pdf", "watched-folder"] });

    vi.mocked(invoke).mockRejectedValueOnce("can't read");
    expect((await processFile("/w", "a.pdf"))?.content).toContain("File: a.pdf");
  });

  it("returns null for a file that can't be read, so it's left for the next scan", async () => {
    vi.mocked(readTextFile).mockRejectedValue(new Error("denied"));
    expect(await processFile("/w", "a.txt")).toBeNull();
  });
});

describe("moveToProcessed", () => {
  it("creates the folder if needed and moves the file into it", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    await moveToProcessed("/w", "a.txt");
    expect(mkdir).toHaveBeenCalledWith("/w/_processed", { recursive: true });
    expect(rename).toHaveBeenCalledWith("/w/a.txt", "/w/_processed/a.txt");
  });

  it("reuses the folder when it exists", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    await moveToProcessed("/w", "a.txt");
    expect(mkdir).not.toHaveBeenCalled();
  });
});

describe("scanFolder", () => {
  it("lists only supported files, skipping folders", async () => {
    vi.mocked(readDir).mockResolvedValue([
      { name: "a.txt", isDirectory: false, isFile: true, isSymlink: false },
      { name: "B.PDF", isDirectory: false, isFile: true, isSymlink: false },
      { name: "photo.png", isDirectory: false, isFile: true, isSymlink: false },
      { name: "_processed", isDirectory: true, isFile: false, isSymlink: false },
      { name: "folder.txt", isDirectory: true, isFile: false, isSymlink: false },
    ]);
    expect(await scanFolder("/w")).toEqual(["a.txt", "B.PDF"]);
  });
});
