import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Edit3, Eye, Save, BookOpen } from "lucide-react";
import { marked } from "marked";
import { useWikiStore } from "../../stores/wiki";
import { useSettingsStore } from "../../stores/settings";
import { ENTITY_COLORS } from "./WikiPageList";
import { WikiEntityType } from "../../types";
import { unescapeBrackets } from "../../utils/markdown";
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
} from '@mdxeditor/editor';

const ENTITY_TYPES: WikiEntityType[] = ["person", "project", "decision", "meeting", "concept", "general"];

export function WikiPageDetail() {
  const { pages, activePageId, update, setActive } = useWikiStore();
  const { settings } = useSettingsStore();
  const page = pages.find((p) => p.id === activePageId) ?? null;

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [entityType, setEntityType] = useState<WikiEntityType>("general");
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setContent(page.content);
      setEntityType(page.entityType);
      setDirty(false);
      setEditing(false);
    }
  }, [activePageId]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleAutoSave(t: string, c: string, et: WikiEntityType) {
    if (!activePageId) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await update(activePageId, { title: t, content: c, entityType: et });
      setDirty(false);
    }, 1000);
  }

  // O(1) lookup instead of O(n) pages.some() per wikilink
  const pageTitleSet = useMemo(
    () => new Set(pages.map((p) => p.title.toLowerCase())),
    [pages]
  );

  const renderedHtml = useMemo(() => {
    const md = unescapeBrackets(content) || "*No content yet. Switch to Edit mode to add content.*";
    const linked = md.replace(/\[\[([^\]]+)\]\]/g, (_, t) => {
      const exists = pageTitleSet.has(t.toLowerCase());
      const cls = exists
        ? "wiki-link text-purple-600 hover:text-purple-800 underline underline-offset-2 cursor-pointer font-medium"
        : "wiki-link text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-500 underline underline-offset-2 cursor-pointer italic";
      return `<a class="${cls}" data-wiki-title="${encodeURIComponent(t)}" href="#">${t}</a>`;
    });
    return marked.parse(linked) as string;
  }, [content, pageTitleSet]);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("[data-wiki-title]");
    if (!target) return;
    e.preventDefault();
    const title = decodeURIComponent(target.getAttribute("data-wiki-title") ?? "");
    const found = pages.find((p) => p.title.toLowerCase() === title.toLowerCase());
    if (found) setActive(found.id);
  }, [pages, setActive]);

  // Force spellcheck on MDXEditor's contenteditable (Lexical disables it by default)
  useEffect(() => {
    if (!editing) return;
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
  }, [editing, activePageId]);

  if (!page) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
        <BookOpen size={48} className="opacity-30 mb-3" />
        <p className="text-sm">Select a page or create one.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(false)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
              ${!editing ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-500"}`}
          >
            <Eye size={12} /> View
          </button>
          <button
            onClick={() => setEditing(true)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
              ${editing ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-500"}`}
          >
            <Edit3 size={12} /> Edit
          </button>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <Save size={11} /> Saving…
            </span>
          )}
          <select
            value={entityType}
            onChange={(e) => {
              const et = e.target.value as WikiEntityType;
              setEntityType(et);
              scheduleAutoSave(title, content, et);
            }}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pt-5 pb-2 shrink-0">
        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); scheduleAutoSave(e.target.value, content, entityType); }}
            className="w-full text-2xl font-bold text-gray-900 dark:text-white border-none outline-none bg-transparent"
          />
        ) : (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{page.title}</h1>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${ENTITY_COLORS[page.entityType]}`}>
              {page.entityType}
            </span>
          </div>
        )}
        {page.sourceIds.length > 0 && !editing && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Compiled from {page.sourceIds.length} note{page.sourceIds.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Content — edit mode lets MDXEditor scroll internally; view mode scrolls the outer wrapper */}
      {editing ? (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-6">
          <div className="nexus-mdx-editor flex-1 min-h-0 flex flex-col" ref={editorWrapperRef}>
            <MDXEditor
              key={activePageId ?? 'none'}
              markdown={page.content}
              onChange={(v) => {
                const clean = unescapeBrackets(v);
                setContent(clean);
                scheduleAutoSave(title, clean, entityType);
              }}
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
      ) : (
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <div
            className="wiki-content"
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>
      )}
    </div>
  );
}
