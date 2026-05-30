import { useState, useEffect, useRef, useMemo } from "react";
import { Sparkles, Eye, Edit3, CheckSquare, X, Loader2 } from "lucide-react";
import { marked } from "marked";
import { useNotesStore } from "../../stores/notes";
import { useTaskStore } from "../../stores/tasks";
import { useSettingsStore } from "../../stores/settings";
import { extractFromNote, hasBedrockConfig } from "../../services/claude";
import { linkNoteTask } from "../../services/notes";
import { ExtractedNoteData } from "../../types";

export function NoteEditor() {
  const { notes, activeNoteId, update } = useNotesStore();
  const { add: addTask } = useTaskStore();
  const { settings } = useSettingsStore();

  const note = notes.find((n) => n.id === activeNoteId) ?? null;
  const cfg = { profile: settings.bedrockProfile, region: settings.bedrockRegion, modelId: settings.bedrockModelId };
  const bedrockReady = hasBedrockConfig(cfg);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [preview, setPreview] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedNoteData | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setTagsInput(note.tags.join(", "));
      setExtracted(null);
      setSelectedTasks(new Set());
    }
  }, [activeNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleSave(newTitle: string, newContent: string, newTags: string) {
    if (!activeNoteId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      const tags = newTags.split(",").map((t) => t.trim()).filter(Boolean);
      await update(activeNoteId, { title: newTitle, content: newContent, tags });
      setSaving(false);
    }, 800);
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    scheduleSave(v, content, tagsInput);
  }

  function handleContentChange(v: string) {
    setContent(v);
    scheduleSave(title, v, tagsInput);
  }

  function handleTagsChange(v: string) {
    setTagsInput(v);
    scheduleSave(title, content, v);
  }

  async function handleExtract() {
    if (!bedrockReady || !activeNoteId) return;
    setExtracting(true);
    try {
      const result = await extractFromNote(
        cfg,
        title,
        content,
        note?.sourceType === "transcript"
      );
      setExtracted(result);
      setSelectedTasks(new Set(result.tasks.map((_, i) => i)));
    } catch (e) {
      console.error("Extraction failed:", e);
    } finally {
      setExtracting(false);
    }
  }

  async function handleCreateTasks() {
    if (!extracted || !activeNoteId) return;
    for (const idx of selectedTasks) {
      const t = extracted.tasks[idx];
      if (!t) continue;
      const created = await addTask({
        title: t.title,
        status: "open",
        priority: t.priority,
        dueDate: t.dueDate,
        tags: t.tags,
        sourceType: "transcript",
        sourceId: activeNoteId,
      });
      await linkNoteTask(activeNoteId, created.id);
    }
    setExtracted(null);
    setSelectedTasks(new Set());
  }

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
        <p className="text-sm">Select a note or create one.</p>
      </div>
    );
  }

  const renderedHtml = useMemo(() => marked.parse(content) as string, [content]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview(false)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${!preview ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-500"}`}
          >
            <Edit3 size={12} /> Edit
          </button>
          <button
            onClick={() => setPreview(true)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${preview ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-500"}`}
          >
            <Eye size={12} /> Preview
          </button>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-gray-400 dark:text-gray-500">Saving…</span>}
          {bedrockReady && (
            <button
              onClick={handleExtract}
              disabled={extracting || !content.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-40 transition-colors"
            >
              {extracting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Extract with AI
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pt-5 pb-1 shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title"
          className="w-full text-xl font-bold text-gray-900 dark:text-white border-none outline-none placeholder-gray-300 dark:placeholder-gray-600 bg-transparent"
        />
      </div>

      {/* Tags */}
      <div className="px-6 pb-3 shrink-0">
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => handleTagsChange(e.target.value)}
          placeholder="Tags (comma-separated)"
          className="text-xs text-gray-400 dark:text-gray-500 border-none outline-none placeholder-gray-300 dark:placeholder-gray-600 bg-transparent w-full"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {preview ? (
          <div
            className="prose prose-sm max-w-none text-gray-800 dark:text-gray-100"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Start writing… (Markdown supported)"
            className="w-full h-full min-h-64 text-sm text-gray-800 dark:text-gray-100 leading-relaxed border-none outline-none resize-none bg-transparent placeholder-gray-300 dark:placeholder-gray-600 font-mono"
          />
        )}
      </div>

      {/* AI Extraction panel */}
      {extracted && (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-purple-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-1.5">
              <Sparkles size={14} /> AI Extraction
            </h3>
            <button onClick={() => setExtracted(null)} className="text-purple-400 hover:text-purple-600">
              <X size={14} />
            </button>
          </div>

          {extracted.summary && (
            <p className="text-xs text-purple-800 leading-relaxed">{extracted.summary}</p>
          )}

          {extracted.tasks.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-purple-700">Action items found:</p>
              {extracted.tasks.map((task, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedTasks.has(i)}
                    onChange={(e) => {
                      const next = new Set(selectedTasks);
                      if (e.target.checked) next.add(i); else next.delete(i);
                      setSelectedTasks(next);
                    }}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-purple-300 text-purple-600"
                  />
                  <span className="text-xs text-purple-900 leading-snug">
                    {task.title}
                    <span className="ml-1.5 text-purple-400">[{task.priority}]</span>
                    {task.dueDate && <span className="ml-1 text-purple-400">· due {task.dueDate}</span>}
                  </span>
                </label>
              ))}
              <button
                onClick={handleCreateTasks}
                disabled={selectedTasks.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 disabled:opacity-40 transition-colors"
              >
                <CheckSquare size={12} /> Create {selectedTasks.size} task{selectedTasks.size !== 1 ? "s" : ""}
              </button>
            </div>
          )}

          {extracted.tasks.length === 0 && (
            <p className="text-xs text-purple-700">No action items found in this note.</p>
          )}

          {extracted.entities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {extracted.entities.map((e) => (
                <span key={e} className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{e}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
