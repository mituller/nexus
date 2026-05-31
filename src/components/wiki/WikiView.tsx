import { useState, useEffect } from "react";
import { Sparkles, AlertTriangle, Search, X, Loader2, CheckCircle2, Network } from "lucide-react";
import { WikiGraph } from "./WikiGraph";
import { useWikiStore } from "../../stores/wiki";
import { useNotesStore } from "../../stores/notes";
import { useTaskStore } from "../../stores/tasks";
import { useSettingsStore } from "../../stores/settings";
import { ingestNoteToWiki, queryWiki, lintWiki, LintResult } from "../../services/wikiAI";
import { markNoteWikiProcessed, getUnprocessedNotes } from "../../services/wiki";
import { WikiPageList } from "./WikiPageList";
import { WikiPageDetail } from "./WikiPageDetail";

type PanelMode = "none" | "ingest" | "query" | "lint";

interface IngestProgress {
  total: number;
  done: number;
  current: string;
  newPages: string[];
  updatedPages: string[];
}

export function WikiView() {
  const { pages, create: createPage, upsertByTitle, setActive, load: loadWiki, loading } = useWikiStore();

  // Load pages on mount in case App.tsx startup already ran before store was ready
  useEffect(() => {
    if (pages.length === 0 && !loading) loadWiki();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { notes } = useNotesStore();
  const { tasks } = useTaskStore();
  const { settings } = useSettingsStore();

  const cfg = { profile: settings.bedrockProfile, region: settings.bedrockRegion, modelId: settings.bedrockModelId };
  const bedrockReady = !!(cfg.profile && cfg.region && cfg.modelId);

  const [panel, setPanel] = useState<PanelMode>("none");
  const [graphView, setGraphView] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<IngestProgress | null>(null);
  const [queryText, setQueryText] = useState("");
  const [queryAnswer, setQueryAnswer] = useState<{ answer: string; citations: string[] } | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [lintResult, setLintResult] = useState<LintResult | null>(null);
  const [lintLoading, setLintLoading] = useState(false);

  async function handleIngest() {
    if (!bedrockReady) return;
    const unprocessed = await getUnprocessedNotes();
    if (unprocessed.length === 0) {
      alert("All notes have been processed. Add more notes first.");
      return;
    }

    setPanel("ingest");
    const progress: IngestProgress = { total: unprocessed.length, done: 0, current: "", newPages: [], updatedPages: [] };
    setIngestProgress({ ...progress });

    const existingTitles = pages.map((p) => p.title);

    for (const note of unprocessed) {
      progress.current = note.title;
      setIngestProgress({ ...progress });

      try {
        const drafts = await ingestNoteToWiki(
          cfg,
          note.title,
          note.content,
          existingTitles
        );

        for (const draft of drafts) {
          const page = await upsertByTitle(draft.title, draft.entityType, draft.content, note.id);
          if (draft.isNew) {
            progress.newPages.push(page.title);
            existingTitles.push(page.title);
          } else {
            if (!progress.updatedPages.includes(page.title)) {
              progress.updatedPages.push(page.title);
            }
          }
        }

        await markNoteWikiProcessed(note.id);
      } catch (e) {
        console.error(`Failed to process note "${note.title}":`, e);
      }

      progress.done++;
      setIngestProgress({ ...progress });
    }

    progress.current = "";
    setIngestProgress({ ...progress });
    await loadWiki();
  }

  async function handleQuery() {
    if (!queryText.trim() || !bedrockReady) return;
    setQueryLoading(true);
    setQueryAnswer(null);
    try {
      const result = await queryWiki(cfg, queryText, pages);
      setQueryAnswer(result);
    } finally {
      setQueryLoading(false);
    }
  }

  async function handleLint() {
    setLintLoading(true);
    setLintResult(null);
    try {
      const result = await lintWiki(cfg, pages, notes.length, tasks.length);
      setLintResult(result);
    } finally {
      setLintLoading(false);
    }
  }

  async function handleNewPage() {
    await create({
      title: "New page",
      content: "",
      entityType: "general",
      tags: [],
      sourceIds: [],
    });
  }

  async function create(page: Parameters<typeof createPage>[0]) {
    const created = await createPage(page);
    setActive(created.id);
  }

  const unprocessedCount = notes.filter((n) => !n.content || n.content.length < 50).length;
  const totalUnprocessed = notes.length - unprocessedCount;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: page list */}
      <div className="w-64 shrink-0">
        <WikiPageList onNewPage={handleNewPage} />
      </div>

      {/* Right: detail + toolbar */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Wiki toolbar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
          <button
            onClick={() => setGraphView((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors
              ${graphView ? "bg-gray-700 text-white border-gray-700" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
          >
            <Network size={12} /> {graphView ? "Pages" : "Graph"}
          </button>
          <div className="flex-1" />
          {bedrockReady && (
            <>
              <button
                onClick={() => { setPanel(panel === "query" ? "none" : "query"); setQueryAnswer(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors
                  ${panel === "query" ? "bg-purple-600 text-white border-purple-600" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
              >
                <Search size={12} /> Query
              </button>
              <button
                onClick={() => { setPanel(panel === "ingest" ? "none" : "ingest"); if (panel !== "ingest") handleIngest(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors
                  ${panel === "ingest" ? "bg-purple-600 text-white border-purple-600" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
              >
                <Sparkles size={12} /> Ingest
                {totalUnprocessed > 0 && panel !== "ingest" && (
                  <span className="ml-0.5 bg-purple-100 text-purple-700 rounded-full px-1.5 text-xs font-medium">
                    {totalUnprocessed}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setPanel(panel === "lint" ? "none" : "lint"); if (panel !== "lint") handleLint(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors
                  ${panel === "lint" ? "bg-orange-500 text-white border-orange-500" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
              >
                <AlertTriangle size={12} /> Lint
              </button>
            </>
          )}
        </div>

        {/* Panel: Query */}
        {panel === "query" && (
          <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-blue-50 px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                placeholder="Ask anything about your wiki… (Enter to search)"
                className="flex-1 px-3 py-2 text-sm border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-800"
                autoFocus
              />
              <button
                onClick={handleQuery}
                disabled={queryLoading || !queryText.trim()}
                className="px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-40"
              >
                {queryLoading ? <Loader2 size={14} className="animate-spin" /> : "Ask"}
              </button>
              <button onClick={() => setPanel("none")} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-500">
                <X size={16} />
              </button>
            </div>
            {queryAnswer && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-blue-200 p-4 space-y-2">
                <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{queryAnswer.answer}</p>
                {queryAnswer.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {queryAnswer.citations.map((c) => (
                      <span key={c} className="text-xs bg-blue-100 text-purple-700 px-2 py-0.5 rounded">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Panel: Ingest progress */}
        {panel === "ingest" && ingestProgress && (
          <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-purple-50 px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-1.5">
                <Sparkles size={14} /> Ingesting notes into wiki…
              </h3>
              {ingestProgress.done === ingestProgress.total && (
                <button onClick={() => setPanel("none")} className="text-purple-400 hover:text-purple-600">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-purple-700">
                <span>{ingestProgress.done} / {ingestProgress.total} notes processed</span>
                {ingestProgress.current && <span className="animate-pulse">Processing: {ingestProgress.current}</span>}
              </div>
              <div className="h-1.5 bg-purple-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${(ingestProgress.done / ingestProgress.total) * 100}%` }}
                />
              </div>
            </div>
            {(ingestProgress.newPages.length > 0 || ingestProgress.updatedPages.length > 0) && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                {ingestProgress.newPages.length > 0 && (
                  <div>
                    <p className="font-medium text-purple-800 mb-1">New pages ({ingestProgress.newPages.length})</p>
                    {ingestProgress.newPages.slice(0, 6).map((t) => (
                      <p key={t} className="text-purple-700 truncate">+ {t}</p>
                    ))}
                  </div>
                )}
                {ingestProgress.updatedPages.length > 0 && (
                  <div>
                    <p className="font-medium text-purple-800 mb-1">Updated ({ingestProgress.updatedPages.length})</p>
                    {ingestProgress.updatedPages.slice(0, 6).map((t) => (
                      <p key={t} className="text-purple-700 truncate">↑ {t}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {ingestProgress.done === ingestProgress.total && ingestProgress.current === "" && (
              <p className="text-xs text-purple-700 flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Done — {ingestProgress.newPages.length} new pages, {ingestProgress.updatedPages.length} updated.
              </p>
            )}
          </div>
        )}

        {/* Panel: Lint results */}
        {panel === "lint" && (
          <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-orange-50 px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-orange-900 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Wiki Health Check
              </h3>
              <button onClick={() => setPanel("none")} className="text-orange-400 hover:text-orange-600">
                <X size={16} />
              </button>
            </div>
            {lintLoading && <p className="text-xs text-orange-700 animate-pulse">Analyzing…</p>}
            {lintResult && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <LintGroup title="Orphaned pages" items={lintResult.orphanedPages} color="text-red-700" />
                <LintGroup title="Broken [[links]]" items={lintResult.missingPages} color="text-orange-700" />
                <LintGroup title="Stale pages (30+ days)" items={lintResult.stalePages} color="text-yellow-700" />
                <LintGroup title="Suggestions" items={lintResult.suggestions} color="text-purple-700" />
              </div>
            )}
          </div>
        )}

        {/* Page detail or graph */}
        {graphView ? (
          <div className="flex-1 relative overflow-hidden">
            <WikiGraph onSelect={() => setGraphView(false)} />
          </div>
        ) : (
          <WikiPageDetail />
        )}
      </div>
    </div>
  );
}

function LintGroup({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (items.length === 0) return (
    <div>
      <p className={`font-medium ${color} mb-1`}>{title}</p>
      <p className="text-gray-400 dark:text-gray-500">None ✓</p>
    </div>
  );
  return (
    <div>
      <p className={`font-medium ${color} mb-1`}>{title} ({items.length})</p>
      {items.slice(0, 4).map((i) => <p key={i} className={`${color} truncate`}>· {i}</p>)}
      {items.length > 4 && <p className="text-gray-400 dark:text-gray-500">+{items.length - 4} more</p>}
    </div>
  );
}
