import { useState, useEffect, useRef } from "react";
import { X, CheckSquare, FileText } from "lucide-react";
import { useTaskStore } from "../../stores/tasks";
import { useNotesStore } from "../../stores/notes";
import { Task } from "../../types";

interface QuickCaptureProps {
  onClose: () => void;
  onNavigate: (view: "tasks" | "notes") => void;
}

type Mode = "task" | "note";

export function QuickCapture({ onClose, onNavigate }: QuickCaptureProps) {
  const [mode, setMode] = useState<Mode>("task");
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { add: addTask } = useTaskStore();
  const { create: createNote, setActive } = useNotesStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "1") setMode("task");
      if ((e.metaKey || e.ctrlKey) && e.key === "2") setMode("note");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    if (mode === "task") {
      await addTask({ title: text.trim(), status: "open", priority, tags: [] });
      onClose();
      onNavigate("tasks");
    } else {
      const note = await createNote({ title: text.trim(), content: "", tags: [], sourceType: "manual" });
      setActive(note.id);
      onClose();
      onNavigate("notes");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-32 z-50 px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mode tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {([["task", "Task", <CheckSquare size={13} />], ["note", "Note", <FileText size={13} />]] as const).map(([m, label, icon]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                mode === m
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300"
              }`}
            >
              {icon}{label}
            </button>
          ))}
          <button onClick={onClose} className="ml-auto px-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-500">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "task" ? "What needs to be done?" : "Note title…"}
            className="w-full text-base border-none outline-none placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-white"
          />

          {mode === "task" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-500">Priority:</span>
              {(["high", "medium", "low"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-2 py-0.5 rounded text-xs capitalize transition-colors ${
                    priority === p
                      ? p === "high" ? "bg-red-100 text-red-700" : p === "medium" ? "bg-orange-100 text-orange-700" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-500"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-500"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-400 dark:text-gray-500">⏎ to save · esc to cancel</span>
            <button
              type="submit"
              disabled={!text.trim() || saving}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : `Add ${mode}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
