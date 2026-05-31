import { useState, useRef, useEffect } from "react";
import { Upload, X, FileText, Loader2, Mail } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useNotesStore } from "../../stores/notes";
import { cleanTranscriptText } from "../../services/claude";
import { parseEml, emlToNoteContent } from "../../services/emlParser";

interface TranscriptImportProps {
  onClose: () => void;
}

type FileType = "vtt" | "eml" | "text";

function detectType(name: string): FileType {
  if (name.endsWith(".vtt")) return "vtt";
  if (name.endsWith(".eml")) return "eml";
  return "text";
}

async function processText(text: string, name: string): Promise<{ title: string; content: string; tags: string[] }> {
  const type = detectType(name);
  if (type === "eml") {
    const email = parseEml(text);
    return {
      title: email.subject || name.replace(/\.eml$/i, ""),
      content: emlToNoteContent(email),
      tags: ["email"],
    };
  }
  const content = type === "vtt" ? cleanTranscriptText(text) : text;
  const title = name.replace(/\.(vtt|txt|text|eml)$/i, "").replace(/[-_]/g, " ");
  return { title, content, tags: ["transcript"] };
}

export function TranscriptImport({ onClose }: TranscriptImportProps) {
  const { create, setActive } = useNotesStore();
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tauri OS-level file drop
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    // Prevent the WebView from navigating to the dropped file URL (which blanks the app)
    const blockDefault = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", blockDefault);
    window.addEventListener("drop", blockDefault);

    getCurrentWindow().onDragDropEvent(async (event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        setDragOver(true);
      } else if (event.payload.type === "leave") {
        setDragOver(false);
      } else if (event.payload.type === "drop" && (event.payload as { paths?: string[] }).paths?.length) {
        setDragOver(false);
        const paths = (event.payload as { paths: string[] }).paths;
        const path = paths[0];
        const name = path.split("/").pop() ?? path.split("\\").pop() ?? "file";
        try {
          const text = await readTextFile(path);
          const processed = await processText(text, name);
          setFileName(name);
          setTitle(processed.title);
          setContent(processed.content);
          setTags(processed.tags);
          setPreview(processed.content.slice(0, 500));
        } catch (e) {
          console.error("Failed to read dropped file:", e);
        }
      }
    }).then((fn: () => void) => { unlisten = fn; });

    return () => {
      window.removeEventListener("dragover", blockDefault);
      window.removeEventListener("drop", blockDefault);
      unlisten?.();
    };
  }, []);

  // Browser file input (click to browse)
  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const processed = await processText(text, f.name);
    setFileName(f.name);
    setTitle(processed.title);
    setContent(processed.content);
    setTags(processed.tags);
    setPreview(processed.content.slice(0, 500));
  }

  function clearFile() {
    setFileName(null);
    setPreview("");
    setTitle("");
    setContent("");
    setTags([]);
  }

  async function handleImport() {
    if (!fileName || !content) return;
    setImporting(true);
    try {
      const note = await create({
        title: title.trim() || fileName,
        content,
        tags,
        sourceType: "transcript",
      });
      setActive(note.id);
      onClose();
    } finally {
      setImporting(false);
    }
  }

  const isEmail = tags.includes("email");

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Import File</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Supports <strong>.eml</strong> (email), <strong>.vtt</strong> (Teams/Zoom transcript), and <strong>.txt</strong>.
            Use <strong>Extract with AI</strong> after import to pull out tasks.
          </p>

          {!fileName ? (
            <div
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg py-10 flex flex-col items-center gap-2 transition-colors
                ${dragOver
                  ? "border-blue-400 dark:border-purple-500 bg-blue-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}
            >
              <Upload size={24} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {dragOver ? "Release to import" : "Drop file here or click to browse"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-600">.eml · .vtt · .txt</p>
              <input
                ref={inputRef}
                type="file"
                accept=".eml,.vtt,.txt,.text"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3 bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-2">
                {isEmail
                  ? <Mail size={16} className="text-blue-500 shrink-0" />
                  : <FileText size={16} className="text-gray-400 dark:text-gray-500 shrink-0" />
                }
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate flex-1">{fileName}</span>
                <button onClick={clearFile} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400">
                  <X size={14} />
                </button>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono leading-relaxed whitespace-pre-wrap">{preview}…</p>
              </div>
            </div>
          )}

          {fileName && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-500 mb-1">Note title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                placeholder="Subject or topic"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!fileName || importing}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-40 transition-colors"
            >
              {importing && <Loader2 size={13} className="animate-spin" />}
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
