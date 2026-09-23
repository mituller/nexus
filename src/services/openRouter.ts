import { fetch } from "@tauri-apps/plugin-http";
import { load } from "@tauri-apps/plugin-store";

/**
 * OpenRouter model catalog helpers.
 *
 * The catalog endpoint (https://openrouter.ai/api/v1/models) is public and
 * returns ~400+ models with per-token pricing. We fetch it through the Tauri
 * http plugin (already scoped to https://**) and cache the result for 24h so
 * the Settings picker doesn't hammer the API.
 */

export interface OpenRouterModel {
  /** Slug used in API calls, e.g. "anthropic/claude-sonnet-4.5" or "~anthropic/claude-sonnet-latest" */
  id: string;
  /** Human name, e.g. "Anthropic: Claude Sonnet Latest" */
  name: string;
  /** USD per 1M input tokens */
  priceIn: number;
  /** USD per 1M output tokens */
  priceOut: number;
  contextLength: number;
}

/** Curated "Recommended" list, ordered. Uses OpenRouter's `-latest` aliases so
 *  it stays current without hardcoding point releases. Every id here is
 *  vendored from the live catalog. */
export const RECOMMENDED_MODEL_IDS = [
  "~anthropic/claude-sonnet-latest", // best all-round Claude
  "~deepseek/deepseek-flash-latest", // cheap workhorse
  "~openai/gpt-luna-latest",
  "~google/gemini-flash-latest",
  "~anthropic/claude-haiku-latest",  // fast/cheap Claude
  "~deepseek/deepseek-pro-latest",   // reasoning, still cheap
  "~x-ai/grok-latest",
  "~z-ai/glm-latest",
  "meta-llama/llama-4-maverick",
  "~moonshotai/kimi-latest",
];

const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_FILE = "openrouter-catalog.json";

let memCache: { fetchedAt: number; models: OpenRouterModel[] } | null = null;

// ─── Parsing ────────────────────────────────────────────────────────────────

function parseModel(raw: Record<string, unknown>): OpenRouterModel {
  const id = String(raw.id ?? "");
  const pricing = (raw.pricing ?? {}) as Record<string, unknown>;
  const perToken = (v: unknown): number => {
    if (typeof v !== "string") return 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n * 1_000_000 : 0;
  };
  return {
    id,
    name: String(raw.name ?? id),
    priceIn: perToken(pricing.prompt),
    priceOut: perToken(pricing.completion),
    contextLength: Number(raw.context_length ?? 0),
  };
}

interface CatalogPage {
  data?: Array<Record<string, unknown>>;
  links?: { next?: string | null };
}

/** Fetch every page of the catalog (currently a single request, but page while
 *  `links.next` exists so bigger catalogs keep working). */
async function fetchCatalogPages(): Promise<OpenRouterModel[]> {
  let next: string | null = `${CATALOG_URL}?limit=1000`;
  let models: OpenRouterModel[] = [];
  let pages = 0;
  while (next && pages < 5) {
    const url = next.startsWith("http") ? next : `https://openrouter.ai${next}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: could not load the model list`);
    const body = (await res.json()) as CatalogPage;
    models.push(...(body.data ?? []).map(parseModel));
    next = body.links?.next ?? null;
    pages++;
  }
  return models;
}

// ─── Caching ────────────────────────────────────────────────────────────────

async function readDiskCache(): Promise<{ fetchedAt: number; models: OpenRouterModel[] } | null> {
  try {
    const store = await load(CACHE_FILE);
    return (await store.get<{ fetchedAt: number; models: OpenRouterModel[] }>("catalog")) ?? null;
  } catch {
    return null;
  }
}

async function writeDiskCache(payload: { fetchedAt: number; models: OpenRouterModel[] }) {
  try {
    const store = await load(CACHE_FILE);
    await store.set("catalog", payload);
  } catch {
    /* cache is best-effort; picker works without it */
  }
}

/** Latest catalog: memory → disk → network. Falls back to stale cache when the
 *  network is down rather than failing; pass `force` to bypass all caches. */
export async function getOpenRouterCatalog(force = false): Promise<OpenRouterModel[]> {
  const now = Date.now();
  if (!force) {
    if (memCache && now - memCache.fetchedAt < CACHE_TTL_MS) return memCache.models;
    const disk = await readDiskCache();
    if (disk && now - disk.fetchedAt < CACHE_TTL_MS) {
      memCache = disk;
      return disk.models;
    }
  }

  try {
    const models = await fetchCatalogPages();
    const payload = { fetchedAt: now, models };
    memCache = payload;
    await writeDiskCache(payload);
    return models;
  } catch (e) {
    const stale = memCache ?? (await readDiskCache());
    if (stale && stale.models.length > 0) return stale.models;
    throw e;
  }
}

/** Look up a single model (or alias) by slug. Returns null if it doesn't exist
 *  on OpenRouter — this is the typo-guard for custom model ids. */
export async function lookupOpenRouterModel(id: string): Promise<OpenRouterModel | null> {
  const parts = id.split("/");
  if (parts.length < 2) return null;
  const [author, ...rest] = parts;
  const url = `https://openrouter.ai/api/v1/model/${encodeURIComponent(author)}/${encodeURIComponent(rest.join("/"))}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, unknown> };
    return body.data ? parseModel(body.data) : null;
  } catch {
    return null;
  }
}

/** Compact price, e.g. "$3 in · $15 out /1M". Empty when pricing is unknown. */
export function formatModelPrice(m: OpenRouterModel): string {
  const usd = (v: number): string => {
    if (v <= 0) return "";
    const s = v < 1 ? v.toFixed(3) : v.toFixed(2);
    return "$" + s.replace(/0+$/, "").replace(/\.$/, "");
  };
  const inS = usd(m.priceIn);
  const outS = usd(m.priceOut);
  if (!inS && !outS) return "";
  return `${inS || "?"} in · ${outS || "?"} out /1M`;
}