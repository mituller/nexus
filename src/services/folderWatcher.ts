import { readDir, readTextFile, mkdir, rename, exists } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { parseEml, emlToNoteContent } from "./emlParser";
import { cleanTranscriptText } from "./claude";

export type WatchedFileFormat = "eml" | "vtt" | "txt" | "md" | "docx" | "doc" | "rtf" | "pdf";

const SUPPORTED_EXTENSIONS: Record<string, WatchedFileFormat> = {
  ".eml":  "eml",
  ".vtt":  "vtt",
  ".txt":  "txt",
  ".text": "txt",
  ".md":   "txt",
  ".docx": "docx",
  ".doc":  "doc",
  ".rtf":  "rtf",
  ".pdf":  "pdf",
};

export interface ImportedFile {
  name: string;
  title: string;
  content: string;
  tags: string[];
  format: WatchedFileFormat;
}

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

// Use macOS textutil via Rust command to extract plain text
async function extractViaTextutil(path: string): Promise<string> {
  return invoke<string>("extract_text_from_file", { path });
}

export async function processFile(folderPath: string, fileName: string): Promise<ImportedFile | null> {
  const ext = getExt(fileName);
  const format = SUPPORTED_EXTENSIONS[ext];
  if (!format) return null;

  const filePath = `${folderPath}/${fileName}`;

  try {
    let content = "";
    let title = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    let tags: string[] = [];

    if (format === "eml") {
      const raw = await readTextFile(filePath);
      const email = parseEml(raw);
      title = email.subject || title;
      content = emlToNoteContent(email);
      tags = ["email", "watched-folder"];
    } else if (format === "vtt") {
      const raw = await readTextFile(filePath);
      content = cleanTranscriptText(raw);
      tags = ["transcript", "watched-folder"];
    } else if (format === "txt") {
      content = await readTextFile(filePath);
      tags = ["watched-folder"];
    } else if (format === "docx" || format === "doc" || format === "rtf") {
      content = await extractViaTextutil(filePath);
      tags = ["document", "watched-folder"];
    } else if (format === "pdf") {
      try {
        content = await extractViaTextutil(filePath);
      } catch {
        content = `[PDF imported — use Extract with AI to process]\n\nFile: ${fileName}`;
      }
      tags = ["pdf", "watched-folder"];
    }

    return { name: fileName, title, content, tags, format };
  } catch (e) {
    console.error(`Failed to process ${fileName}:`, e);
    return null;
  }
}

export async function moveToProcessed(folderPath: string, fileName: string): Promise<void> {
  const processedDir = `${folderPath}/_processed`;
  if (!(await exists(processedDir))) {
    await mkdir(processedDir, { recursive: true });
  }
  await rename(`${folderPath}/${fileName}`, `${processedDir}/${fileName}`);
}

export async function scanFolder(folderPath: string): Promise<string[]> {
  const entries = await readDir(folderPath);
  return entries
    .filter((e) => !e.isDirectory && e.name && SUPPORTED_EXTENSIONS[getExt(e.name)])
    .map((e) => e.name!);
}
