import { useState, useEffect, useRef, useMemo } from "react";
import { Sparkles, Eye, Edit3, CheckSquare, X, Loader2, BadgeCheck, AlertCircle } from "lucide-react";
import { Task } from "../../types";
import { marked } from "marked";
import { format, parseISO } from "date-fns";
import { useNotesStore } from "../../stores/notes";
import { useTaskStore } from "../../stores/tasks";
import { useSettingsStore } from "../../stores/settings";
import { extractFromNote, hasBedrockConfig } from "../../services/claude";
import { linkNoteTask, markNoteExtracted, resetNoteWikiProcessed } from "../../services/notes";
import { ExtractedNoteData } from "../../types";

export function NoteEditor() {
  const { notes, activeNoteId, update } = useNotesStore();
  const { add: addTask, tasks } = useTaskStore();
  const { settings } = useSettingsStore();

  const note = notes.find((n) => n.id === activeNoteId) ?? null;
  const cfg = { profile: settings.bedrockProfile, region: settings.bedrockRegion, modelId: settings.bedrockModelId };
  const bedrockReady = hasBedrockConfig(cfg);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [preview, setPreview] = useState(true); // default to preview
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setSearchIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedNoteData | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [taskActions, setTaskActions] = useState<Record<number, "create" | "skip" | "update">>({});
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setTagsInput(note.tags.join(", "));
      setPreview(true); // always open to preview when switching notes
      setSearching(false);
      setSearchQuery("");
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

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;

    if (e.key === "Tab") {
      e.preventDefault();
      const lineStart = val.lastIndexOf("\n", start - 1) + 1;
      const lineEndRaw = val.indexOf("\n", start);
      const lineEndPos = lineEndRaw === -1 ? val.length : lineEndRaw;
      const currentLine = val.slice(lineStart, lineEndPos);

      if (/^(\s*)([-*+]|\d+\.)\s/.test(currentLine)) {
        if (e.shiftKey) {
          // De-indent: remove up to 2 leading spaces
          const deindented = currentLine.replace(/^ {1,2}/, "");
          const removed = currentLine.length - deindented.length;
          const newVal = val.slice(0, lineStart) + deindented + val.slice(lineEndPos);
          ta.value = newVal;
          ta.selectionStart = ta.selectionEnd = Math.max(lineStart, start - removed);
          handleContentChange(newVal);
        } else {
          // Indent: prepend 2 spaces to the line
          const newVal = val.slice(0, lineStart) + "  " + currentLine + val.slice(lineEndPos);
          ta.value = newVal;
          ta.selectionStart = ta.selectionEnd = start + 2;
          handleContentChange(newVal);
        }
      } else {
        // Not a list item — insert spaces at cursor position
        const newVal = val.slice(0, start) + "  " + val.slice(end);
        ta.value = newVal;
        ta.selectionStart = ta.selectionEnd = start + 2;
        handleContentChange(newVal);
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const lineStart = val.lastIndexOf("\n", start - 1) + 1;
      const lineEndRaw = val.indexOf("\n", lineStart);
      const lineEndPos = lineEndRaw === -1 ? val.length : lineEndRaw;
      const currentLine = val.slice(lineStart, start);
      const fullLine = val.slice(lineStart, lineEndPos);

      const indentMatch = currentLine.match(/^(\s+)/);
      const indent = indentMatch?.[1] ?? "";

      const listMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)\s/);
      const continuation = listMatch ? listMatch[0] : indent;

      // Use fullLine so detection works regardless of cursor position within the line
      const isEmptyListItem = /^(\s*)([-*+]|\d+\.)\s*$/.test(fullLine);

      if (isEmptyListItem) {
        const newVal = val.slice(0, lineStart) + val.slice(lineEndPos);
        ta.value = newVal;
        ta.selectionStart = ta.selectionEnd = lineStart;
        handleContentChange(newVal);
        return;
      }

      const newVal = val.slice(0, start) + "\n" + continuation + val.slice(end);
      const newPos = start + 1 + continuation.length;
      ta.value = newVal;
      ta.selectionStart = ta.selectionEnd = newPos;
      handleContentChange(newVal);
      return;
    }
  }

  function handleContentChange(v: string) {
    setContent(v);
    scheduleSave(title, v, tagsInput);
  }

  function handleTagsChange(v: string) {
    setTagsInput(v);
    scheduleSave(title, content, v);
  }

  // Word-based Jaccard similarity — ignores short words and punctuation
  function taskSimilarity(a: string, b: string): number {
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    const w1 = new Set(normalize(a));
    const w2 = new Set(normalize(b));
    if (w1.size === 0 || w2.size === 0) return 0;
    const intersection = [...w1].filter(w => w2.has(w)).length;
    return intersection / new Set([...w1, ...w2]).size;
  }

  function findSimilarTask(title: string): { task: Task; score: number } | null {
    let best: { task: Task; score: number } | null = null;
    for (const t of tasks.filter(t => t.status !== "done")) {
      const score = taskSimilarity(title, t.title);
      if (score >= 0.45 && (!best || score > best.score)) {
        best = { task: t, score };
      }
    }
    return best;
  }

  async function handleExtract() {
    if (!bedrockReady || !activeNoteId) return;
    setExtracting(true);
    try {
      const result = await extractFromNote(cfg, title, content, note?.sourceType === "transcript");

      const enriched = result.tasks.map((t) => {
        const exact = tasks.some(e => e.status !== "done" && e.title.toLowerCase().trim() === t.title.toLowerCase().trim());
        if (exact) return { ...t, alreadyExists: true, similarTask: null as Task | null };
        const match = findSimilarTask(t.title);
        return { ...t, alreadyExists: false, similarTask: match?.task ?? null, similarityScore: match?.score ?? 0 };
      });

      setExtracted({ ...result, tasks: enriched });
      // Default actions: skip exact/similar matches, create truly new ones
      const defaultActions: Record<number, "create" | "skip" | "update"> = {};
      enriched.forEach((t, i) => {
        defaultActions[i] = (t as typeof t & { alreadyExists?: boolean; similarTask?: Task | null }).alreadyExists ? "skip"
          : (t as typeof t & { similarTask?: Task | null }).similarTask ? "skip"
          : "create";
      });
      setTaskActions(defaultActions);
      setSelectedTasks(new Set(enriched.map((_, i) => i).filter(i => defaultActions[i] === "create")));

      // Mark as extracted; also re-queue for wiki ingest so pages stay current
      await markNoteExtracted(activeNoteId);
      await resetNoteWikiProcessed(activeNoteId);
      update(activeNoteId, { extractedAt: new Date().toISOString(), wikiProcessedAt: undefined });
    } catch (e) {
      console.error("Extraction failed:", e);
    } finally {
      setExtracting(false);
    }
  }

  async function handleCreateTasks() {
    if (!extracted || !activeNoteId) return;
    const { update: updateTask } = useTaskStore.getState();
    for (let idx = 0; idx < extracted.tasks.length; idx++) {
      const t = extracted.tasks[idx] as typeof extracted.tasks[number] & { alreadyExists?: boolean; similarTask?: Task | null };
      const action = taskActions[idx] ?? "skip";
      if (action === "skip") continue;

      if (action === "update" && t.similarTask) {
        // Append new context to existing task description
        const extra = [t.dueDate ? `Due: ${t.dueDate}` : "", ...t.tags].filter(Boolean).join(", ");
        const newDesc = [t.similarTask.description, `[From note: ${title}]`, extra].filter(Boolean).join("\n");
        await updateTask(t.similarTask.id, {
          description: newDesc,
          dueDate: t.dueDate ?? t.similarTask.dueDate,
          tags: [...new Set([...t.similarTask.tags, ...t.tags])],
        });
      } else if (action === "create") {
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
    }
    setExtracted(null);
    setSelectedTasks(new Set());
    setTaskActions({});
  }

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
        <p className="text-sm">Select a note or create one.</p>
      </div>
    );
  }

  // Cmd+F / Ctrl+F — open in-note search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && note) {
        e.preventDefault();
        setPreview(true);
        setSearching((v) => {
          if (!v) setTimeout(() => searchRef.current?.focus(), 50);
          return true;
        });
      }
      if (e.key === "Escape") {
        setSearching(false);
        setSearchQuery("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [note]);

  // Build highlighted HTML — wrap matches in <mark>
  const renderedHtml = useMemo(() => {
    const raw = marked.parse(content) as string;
    if (!searchQuery.trim() || !searching) return raw;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return raw.replace(
      new RegExp(`(${escaped})`, "gi"),
      '<mark class="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">$1</mark>'
    );
  }, [content, searchQuery, searching]);

  const matchCount = useMemo(() => {
    if (!searchQuery.trim() || !searching) return 0;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (content.match(new RegExp(escaped, "gi")) ?? []).length;
  }, [content, searchQuery, searching]);

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
          {note.extractedAt && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500" title={`Extracted ${format(parseISO(note.extractedAt), "MMM d 'at' h:mm a")}`}>
              <BadgeCheck size={13} /> Extracted
            </span>
          )}
          {bedrockReady && (
            <button
              onClick={handleExtract}
              disabled={extracting || !content.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 disabled:opacity-40 transition-colors"
            >
              {extracting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {note.extractedAt ? "Re-extract" : "Extract with AI"}
            </button>
          )}
        </div>
      </div>

      {/* In-note search bar */}
      {searching && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setSearchIdx((i) => (i + 1) % Math.max(matchCount, 1));
              }
              if (e.key === "Escape") { setSearching(false); setSearchQuery(""); }
            }}
            placeholder="Search in note…"
            className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
          />
          {searchQuery && (
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
              {matchCount === 0 ? "No matches" : `${matchCount} match${matchCount !== 1 ? "es" : ""}`}
            </span>
          )}
          <button
            onClick={() => { setSearching(false); setSearchQuery(""); }}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
            className="wiki-content"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleEditorKeyDown}
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
            <div className="space-y-2">
              <p className="text-xs font-medium text-purple-700 dark:text-purple-300">Action items found:</p>
              {extracted.tasks.map((task, i) => {
                type EnrichedTask = typeof task & { alreadyExists?: boolean; similarTask?: Task | null; similarityScore?: number };
                const t = task as EnrichedTask;
                const action = taskActions[i] ?? "create";
                const pct = t.similarityScore ? Math.round(t.similarityScore * 100) : 0;

                return (
                  <div key={i} className={`rounded-lg border px-3 py-2 text-xs space-y-1.5
                    ${t.alreadyExists ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 opacity-70"
                    : t.similarTask ? "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20"
                    : "border-purple-100 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10"}`}>

                    {/* Task title + meta */}
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <span className={`font-medium ${t.alreadyExists ? "line-through text-gray-400 dark:text-gray-500" : "text-purple-900 dark:text-purple-100"}`}>
                        {task.title}
                      </span>
                      <span className="text-purple-400 dark:text-purple-500">[{task.priority}]</span>
                      {task.dueDate && <span className="text-purple-400 dark:text-purple-500">· due {task.dueDate}</span>}
                    </div>

                    {/* Exact match */}
                    {t.alreadyExists && (
                      <p className="text-green-700 dark:text-green-400 flex items-center gap-1">
                        ✓ Already in task list — skipping
                      </p>
                    )}

                    {/* Similar match */}
                    {!t.alreadyExists && t.similarTask && (
                      <div className="space-y-1.5">
                        <p className="text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                          <AlertCircle size={11} /> {pct}% similar to: <em className="font-medium">{t.similarTask.title}</em>
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          {(["skip", "update", "create"] as const).map((a) => (
                            <button key={a} type="button"
                              onClick={() => setTaskActions(prev => ({ ...prev, [i]: a }))}
                              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${action === a
                                ? a === "skip" ? "bg-gray-600 text-white"
                                  : a === "update" ? "bg-blue-600 text-white"
                                  : "bg-purple-600 text-white"
                                : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"}`}>
                              {a === "skip" ? "Skip" : a === "update" ? "Update existing" : "Create new"}
                            </button>
                          ))}
                        </div>
                        {action === "update" && (
                          <p className="text-blue-600 dark:text-blue-400 text-xs">Will append context and any new due date/tags to the existing task.</p>
                        )}
                      </div>
                    )}

                    {/* New task checkbox */}
                    {!t.alreadyExists && !t.similarTask && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={selectedTasks.has(i)}
                          onChange={(e) => {
                            const next = new Set(selectedTasks);
                            if (e.target.checked) next.add(i); else next.delete(i);
                            setSelectedTasks(next);
                            setTaskActions(prev => ({ ...prev, [i]: e.target.checked ? "create" : "skip" }));
                          }}
                          className="h-3.5 w-3.5 rounded border-purple-300 text-purple-600" />
                        <span className="text-purple-600 dark:text-purple-400">Add to tasks</span>
                      </label>
                    )}
                  </div>
                );
              })}

              {/* Action button */}
              {(() => {
                const creates = Object.values(taskActions).filter(a => a === "create").length + selectedTasks.size - Object.values(taskActions).filter((a, i) => a === "create" && selectedTasks.has(Number(Object.keys(taskActions)[i]))).length;
                const updates = Object.values(taskActions).filter(a => a === "update").length;
                const total = Object.values(taskActions).filter(a => a !== "skip").length;
                return total > 0 ? (
                  <button onClick={handleCreateTasks}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 transition-colors">
                    <CheckSquare size={12} />
                    {[creates > 0 && `Create ${creates}`, updates > 0 && `Update ${updates}`].filter(Boolean).join(" · ")}
                  </button>
                ) : null;
              })()}
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
