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
import { findSimilarTask, hasExactTask } from "../../utils/taskMatching";
import { unescapeBrackets } from "../../utils/markdown";
import { ExtractedNoteData } from "../../types";
import '@mdxeditor/editor/style.css';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect,
  Separator,
  InsertThematicBreak,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  type MDXEditorMethods,
} from '@mdxeditor/editor';

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
  const editorRef = useRef<MDXEditorMethods>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  // MDXEditor fires onChange during initialization when it normalizes content.
  // Ignore onChange for 400ms after a note switch to prevent corrupting the note.
  const editorReadyRef = useRef(false);
  const editorReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Reset editor guard — ignore onChange for 400ms while MDXEditor initializes
      editorReadyRef.current = false;
      if (editorReadyTimerRef.current) clearTimeout(editorReadyTimerRef.current);
      editorReadyTimerRef.current = setTimeout(() => { editorReadyRef.current = true; }, 400);
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
    if (!editorReadyRef.current) return;
    const clean = unescapeBrackets(v);
    setContent(clean);
    scheduleSave(title, clean, tagsInput);
  }

  function handleTagsChange(v: string) {
    setTagsInput(v);
    scheduleSave(title, content, v);
  }

  async function handleExtract() {
    if (!bedrockReady || !activeNoteId) return;
    setExtracting(true);
    try {
      const result = await extractFromNote(cfg, title, content, note?.sourceType === "transcript");

      const enriched = result.tasks.map((t) => {
        if (hasExactTask(t.title, tasks)) return { ...t, alreadyExists: true, similarTask: null as Task | null };
        const match = findSimilarTask(t.title, tasks);
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

  // Force spellcheck on MDXEditor's contenteditable (Lexical disables it by default)
  useEffect(() => {
    if (preview) return;
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;
    const enable = () => {
      wrapper.querySelectorAll<HTMLElement>('[contenteditable]').forEach(el => { el.spellcheck = true; });
    };
    const timer = setTimeout(enable, 50);
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(m => m.addedNodes.length > 0)) enable();
    });
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [preview, activeNoteId]);

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
              {note.extractedAt ? "Re-extract Tasks" : "Extract Tasks"}
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

      {/* Content — preview scrolls the outer wrapper; edit mode lets MDXEditor scroll internally */}
      {preview ? (
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div
            className="wiki-content"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-6">
          <div className="nexus-mdx-editor flex-1 min-h-0 flex flex-col" ref={editorWrapperRef}>
            <MDXEditor
              key={activeNoteId ?? 'none'}
              ref={editorRef}
              markdown={note.content.replace(/<[^>]*>/g, '')}
              onChange={handleContentChange}
              plugins={[
                toolbarPlugin({ toolbarContents: () => (
                  <DiffSourceToggleWrapper>
                    <UndoRedo />
                    <Separator />
                    <BlockTypeSelect />
                    <Separator />
                    <BoldItalicUnderlineToggles />
                    <Separator />
                    <ListsToggle />
                    <Separator />
                    <InsertThematicBreak />
                  </DiffSourceToggleWrapper>
                )}),
                headingsPlugin(),
                listsPlugin(),
                quotePlugin(),
                thematicBreakPlugin(),
                markdownShortcutPlugin(),
                diffSourcePlugin({ viewMode: 'rich-text' }),
              ]}
              className={settings.darkMode ? 'dark-theme dark-editor' : ''}
              contentEditableClassName="min-h-48 outline-none"
            />
          </div>
        </div>
      )}

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
