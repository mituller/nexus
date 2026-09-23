import { useState } from "react";
import { Search, Check, X, Loader2, RefreshCw, ChevronDown } from "lucide-react";
import {
  getOpenRouterCatalog,
  lookupOpenRouterModel,
  formatModelPrice,
  RECOMMENDED_MODEL_IDS,
  OpenRouterModel,
} from "../../services/openRouter";

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

/**
 * Model picker for OpenRouter. Shows a curated "Recommended" list with live
 * pricing, search across the full catalog, the current model always pinned,
 * and a validated custom-id input (real API lookup so typos are caught).
 */
export function OpenRouterModelPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<OpenRouterModel[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<OpenRouterModel | null>(null);
  const [customId, setCustomId] = useState("");
  const [customResult, setCustomResult] = useState<{ ok: boolean; label: string; id?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  async function ensureCatalog(force = false) {
    setLoading(true);
    setCatalogError(null);
    try {
      const models = await getOpenRouterCatalog(force);
      setCatalog(models);
      await resolveCurrent(models);
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /** Show a friendly row for the saved model even when it's not in the catalog
   *  (alias, paused, or custom id) — always resolve via the API if needed. */
  async function resolveCurrent(models?: OpenRouterModel[]) {
    const list = models ?? catalog;
    if (!value) { setCurrent(null); return; }
    const inCat = list?.find((m) => m.id === value);
    if (inCat) { setCurrent(inCat); return; }
    const looked = await lookupOpenRouterModel(value);
    setCurrent(looked ?? null);
  }

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  async function checkCustom() {
    const id = customId.trim();
    if (!id) return;
    setChecking(true);
    setCustomResult(null);
    const m = await lookupOpenRouterModel(id);
    if (m) {
      setCustomResult({ ok: true, id, label: `${m.name} — $${m.priceIn ? m.priceIn.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "?"} in /1M` });
    } else {
      setCustomResult({ ok: false, label: `No model found for "${id}". Double-check the id at openrouter.ai/models.` });
    }
    setChecking(false);
  }

  // ─── Derived list ─────────────────────────────────────────────────────────

  const q = query.trim().toLowerCase();
  const matches = q
    ? (catalog ?? []).filter(
        (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
      )
    : [];
  const visible = matches.slice(0, 60);
  const recommended = catalog
    ? RECOMMENDED_MODEL_IDS
        .map((id) => catalog.find((m) => m.id === id))
        .filter((m): m is OpenRouterModel => !!m)
    : [];

  const currentId = value;

  return (
    <div className="relative">
      {/* Trigger row: current selection + Change button */}
      <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 bg-white dark:bg-gray-800">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Model</p>
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
            {current ? current.name : currentId || "No model selected"}
          </p>
          <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate">
            {currentId && current && current.id !== currentId ? `${currentId} · ` : ""}
            {current ? formatModelPrice(current) : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(!open); if (!open) void resolveCurrent(); }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-800 rounded-md transition-colors"
        >
          {current ? "Change" : "Choose"} <ChevronDown size={13} />
        </button>
      </div>

      {open && (
        <>
          {/* Backdrop — click anywhere outside to close */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100 dark:border-gray-700">
              <Search size={13} className="text-gray-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
                placeholder="Search all models — e.g. deepseek…"
                className="flex-1 min-w-0 bg-transparent text-sm px-1 py-0.5 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              {loading ? (
                <Loader2 size={13} className="animate-spin text-gray-400 shrink-0" />
              ) : (
                <button
                  type="button"
                  title="Refresh model list"
                  onClick={() => void ensureCatalog(true)}
                  className="text-gray-400 hover:text-purple-600 shrink-0"
                >
                  <RefreshCw size={13} />
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto px-2 py-1.5">
              {catalogError && !catalog && (
                <p className="text-xs text-red-600 dark:text-red-400 px-2 py-2">
                  Couldn't load the model list: {catalogError}
                </p>
              )}

              {catalog && !q && (
                <>
                  {/* Current selection, pinned */}
                  {(current || currentId) && !recommended.some((m) => m.id === currentId) && (
                    <SectionLabel>Current</SectionLabel>
                  )}
                  {current && !recommended.some((m) => m.id === currentId) && (
                    <ModelRow m={current} selected currentId={currentId} onPick={() => pick(current.id)} />
                  )}
                  {!current && currentId && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-purple-50 dark:bg-purple-900/20">
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Current (not in catalog)</p>
                        <p className="text-xs font-mono text-gray-800 dark:text-gray-100 truncate">{currentId}</p>
                      </div>
                      <button type="button" onClick={() => pick(currentId)} className="text-xs text-purple-600 hover:underline">Keep</button>
                    </div>
                  )}

                  {/* Recommended */}
                  {recommended.length > 0 && (
                    <>
                      <SectionLabel>Recommended</SectionLabel>
                      {recommended.map((m) => (
                        <ModelRow key={m.id} m={m} selected={m.id === currentId} currentId={currentId} onPick={() => pick(m.id)} />
                      ))}
                    </>
                  )}

                  <p className="text-[10px] text-gray-400 dark:text-gray-500 px-2 py-1.5">
                    Tip: type above to search all {catalog.length}+ models. Prices are per 1M tokens from OpenRouter.
                  </p>
                </>
              )}

              {catalog && q && (
                <>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 px-2 py-1">
                    {matches.length} match{matches.length !== 1 ? "es" : ""} for "{query.trim()}"
                  </p>
                  {visible.map((m) => (
                    <ModelRow key={m.id} m={m} selected={m.id === currentId} currentId={currentId} onPick={() => pick(m.id)} />
                  ))}
                  {matches.length > visible.length && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 px-2.5 py-1.5">
                      +{matches.length - visible.length} more — refine your search
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Custom id with validation */}
            <div className="border-t border-gray-100 dark:border-gray-700 px-2.5 py-2">
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Don't see it? Enter any model id or alias (e.g.{" "}
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">deepseek/deepseek-v4-pro:free</code>):
              </p>
              <div className="flex gap-1.5 mt-1">
                <input
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void checkCustom(); }}
                  placeholder="author/model:variant"
                  className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                />
                <button
                  type="button"
                  onClick={() => void checkCustom()}
                  disabled={checking || !customId.trim()}
                  className="px-2.5 py-1 text-xs font-medium text-purple-600 border border-purple-600/30 rounded-md hover:bg-purple-50 disabled:opacity-40"
                >
                  {checking ? "Checking…" : "Check"}
                </button>
              </div>
              {customResult && (
                <div className="flex items-center gap-2 mt-1">
                  {customResult.ok ? (
                    <Check size={12} className="text-green-600 shrink-0" />
                  ) : (
                    <X size={12} className="text-red-500 shrink-0" />
                  )}
                  <p className={`text-[10px] flex-1 truncate ${customResult.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {customResult.label}
                  </p>
                  {customResult.ok && customResult.id && (
                    <button type="button" onClick={() => pick(customResult.id!)} className="text-xs text-purple-600 hover:underline">
                      Use
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Internal bits ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-2.5 py-1.5">
      {children}
    </p>
  );
}

function ModelRow({
  m,
  selected,
  currentId,
  onPick,
}: {
  m: OpenRouterModel;
  selected: boolean;
  currentId: string;
  onPick: () => void;
}) {
  const price = formatModelPrice(m);
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex items-center justify-between w-full text-left px-2.5 py-1.5 rounded-md transition-colors ${selected ? "bg-purple-50 dark:bg-purple-900/20" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="block text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{m.name}</span>
          {selected && <Check size={11} className="text-purple-600 shrink-0" />}
        </span>
        <span className="block text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate">
          {m.id === currentId ? "current · " : ""}{m.id}
        </span>
      </span>
      {price && <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">{price}</span>}
    </button>
  );
}