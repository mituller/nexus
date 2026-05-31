import { useState } from "react";
import { Plus, Search, FileText, Upload, Mail, Trash2, BadgeCheck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useNotesStore } from "../../stores/notes";

interface NotesListProps {
  onImportTranscript: () => void;
}

export function NotesList({ onImportTranscript }: NotesListProps) {
  const { notes, activeNoteId, create, remove, setActive } = useNotesStore();
  const [search, setSearch] = useState("");

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase())
  );

  async function handleNew() {
    await create({
      title: "New note",
      content: "",
      tags: [],
      sourceType: "manual",
    });
  }

  return (
    <div className="flex flex-col h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="px-3 pt-4 pb-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleNew}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            <Plus size={14} /> New note
          </button>
          <button
            onClick={onImportTranscript}
            title="Import transcript"
            className="p-1.5 border border-gray-200 dark:border-gray-700 rounded-md text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Upload size={15} />
          </button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
            {search ? "No matching notes." : "No notes yet."}
          </p>
        )}
        {filtered.map((note) => (
          <button
            key={note.id}
            onClick={() => setActive(note.id)}
            className={`group w-full text-left px-3 py-3 border-b border-gray-100 dark:border-gray-700 transition-colors
              ${activeNoteId === note.id ? "bg-purple-50 border-l-2 border-l-purple-500" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
          >
            <div className="flex items-start justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {note.tags.includes("email") ? (
                  <Mail size={12} className="text-blue-500 shrink-0" />
                ) : note.tags.includes("transcript") ? (
                  <Upload size={12} className="text-purple-500 shrink-0" />
                ) : (
                  <FileText size={12} className="text-gray-400 dark:text-gray-500 shrink-0" />
                )}
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{note.title}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {note.extractedAt && (
                  <span title="Tasks extracted"><BadgeCheck size={12} className="text-green-500" /></span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); remove(note.id); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate leading-relaxed">
              {note.content.replace(/#+\s/g, "").slice(0, 80) || "Empty"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-300">
                {format(parseISO(note.updatedAt), "MMM d")}
              </span>
              {note.tags.slice(0, 2).map((t) => (
                <span key={t} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 px-1.5 rounded">{t}</span>
              ))}
              {note.linkedEventTitle && (
                <span className="text-xs text-blue-400 truncate">· {note.linkedEventTitle}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
