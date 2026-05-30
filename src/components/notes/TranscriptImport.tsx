import { useState, useRef } from "react";
import { Upload, X, FileText, Loader2 } from "lucide-react";
import { useNotesStore } from "../../stores/notes";
import { cleanTranscriptText } from "../../services/claude";

interface TranscriptImportProps {
  onClose: () => void;
}

export function TranscriptImport({ onClose }: TranscriptImportProps) {
  const { create, setActive } = useNotesStore();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [title, setTitle] = useState("");
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function readFile(f: File) {
    const text = await f.text();
    const cleaned = f.name.endsWith(".vtt") ? cleanTranscriptText(text) : text;
    setFile(f);
    setPreview(cleaned.slice(0, 500));
    // Auto-generate title from filename
    setTitle(f.name.replace(/\.(vtt|txt|docx?)$/i, "").replace(/[-_]/g, " "));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) readFile(f);
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const cleaned = file.name.endsWith(".vtt") ? cleanTranscriptText(text) : text;
      const note = await create({
        title: title.trim() || file.name,
        content: cleaned,
        tags: ["transcript"],
        sourceType: "transcript",
      });
      setActive(note.id);
      onClose();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 text-sm">Import Transcript</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Supports <strong>.vtt</strong> (Teams/Zoom WebVTT), <strong>.txt</strong> plain text, and other text files.
            After import, use <strong>Extract with AI</strong> to pull out action items and tasks.
          </p>

          {/* Drop zone */}
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg py-10 flex flex-col items-center gap-2 cursor-pointer transition-colors
                ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
            >
              <Upload size={24} className="text-gray-300" />
              <p className="text-sm text-gray-500">Drop file here or click to browse</p>
              <p className="text-xs text-gray-400">.vtt · .txt · .text</p>
              <input
                ref={inputRef}
                type="file"
                accept=".vtt,.txt,.text"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-gray-400" />
                <span className="text-sm text-gray-700 font-medium truncate flex-1">{file.name}</span>
                <button onClick={() => { setFile(null); setPreview(""); setTitle(""); }} className="text-gray-300 hover:text-gray-500">
                  <X size={14} />
                </button>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-xs text-gray-500 font-mono leading-relaxed whitespace-pre-wrap">{preview}…</p>
              </div>
            </div>
          )}

          {file && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Meeting name or topic"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
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
