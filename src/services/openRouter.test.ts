import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { load } from "@tauri-apps/plugin-store";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }));

type OpenRouter = typeof import("./openRouter");

const rawModel = {
  id: "a/b", name: "A: B", context_length: 1000, pricing: { prompt: "0.000003", completion: "0.000015" },
};
const parsedModel = { id: "a/b", name: "A: B", priceIn: 3, priceOut: 15, contextLength: 1000 };

function catalogResponse(data: unknown[], next?: string) {
  return new Response(JSON.stringify({ data, links: { next } }));
}

let disk: Record<string, unknown>;
let openRouter: OpenRouter;

// The module keeps its cache in a variable, so each test gets a fresh copy.
beforeEach(async () => {
  disk = {};
  vi.mocked(load).mockResolvedValue({
    get: async (key: string) => disk[key],
    set: async (key: string, value: unknown) => { disk[key] = value; },
  } as never);
  vi.mocked(fetch).mockImplementation(async () => catalogResponse([rawModel]));
  vi.resetModules();
  openRouter = await import("./openRouter");
});

describe("getOpenRouterCatalog", () => {
  it("fetches and converts prices to dollars per million", async () => {
    const [model] = await openRouter.getOpenRouterCatalog();
    expect(model.id).toBe("a/b");
    expect(model.priceIn).toBeCloseTo(3);
    expect(model.priceOut).toBeCloseTo(15);
    expect(model.contextLength).toBe(1000);
  });

  it("handles a model with missing or invalid details", async () => {
    vi.mocked(fetch).mockImplementation(async () => catalogResponse([{ id: "x", pricing: { prompt: "free", completion: 1 } }, {}]));
    expect(await openRouter.getOpenRouterCatalog()).toEqual([
      { id: "x", name: "x", priceIn: 0, priceOut: 0, contextLength: 0 },
      { id: "", name: "", priceIn: 0, priceOut: 0, contextLength: 0 },
    ]);
  });

  it("follows relative and absolute next links", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(catalogResponse([rawModel], "/api/v1/models?page=2"))
      .mockResolvedValueOnce(catalogResponse([rawModel], "https://openrouter.ai/api/v1/models?page=3"))
      .mockResolvedValueOnce(catalogResponse([rawModel]));

    expect(await openRouter.getOpenRouterCatalog()).toHaveLength(3);
    expect(vi.mocked(fetch).mock.calls.map((c) => c[0])).toEqual([
      "https://openrouter.ai/api/v1/models?limit=1000",
      "https://openrouter.ai/api/v1/models?page=2",
      "https://openrouter.ai/api/v1/models?page=3",
    ]);
  });

  it("stops after five pages", async () => {
    vi.mocked(fetch).mockImplementation(async () => catalogResponse([rawModel], "/next"));
    expect(await openRouter.getOpenRouterCatalog()).toHaveLength(5);
  });

  it("reuses the catalog in memory", async () => {
    await openRouter.getOpenRouterCatalog();
    await openRouter.getOpenRouterCatalog();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses a recent catalog from disk", async () => {
    disk.catalog = { fetchedAt: Date.now() - 1000, models: [parsedModel] };
    expect(await openRouter.getOpenRouterCatalog()).toEqual([parsedModel]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refetches once the catalog on disk is a day old, and saves the result", async () => {
    disk.catalog = { fetchedAt: Date.now() - 25 * 60 * 60 * 1000, models: [] };
    await openRouter.getOpenRouterCatalog();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((disk.catalog as { models: unknown[] }).models).toHaveLength(1);
  });

  it("skips the caches when forced", async () => {
    await openRouter.getOpenRouterCatalog();
    await openRouter.getOpenRouterCatalog(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to an old catalog when the network is down", async () => {
    disk.catalog = { fetchedAt: 0, models: [parsedModel] };
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(await openRouter.getOpenRouterCatalog()).toEqual([parsedModel]);
  });

  it("reports the failure when there's no catalog to fall back to", async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response("", { status: 500 }));
    await expect(openRouter.getOpenRouterCatalog()).rejects.toThrow("OpenRouter 500");
  });

  it("works when the disk cache is unavailable", async () => {
    vi.mocked(load).mockRejectedValue(new Error("no disk"));
    expect(await openRouter.getOpenRouterCatalog()).toHaveLength(1);
  });
});

describe("lookupOpenRouterModel", () => {
  it("fetches one model, encoding its author and name", async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ data: rawModel })));
    expect((await openRouter.lookupOpenRouterModel("~a/b/c:free"))?.id).toBe("a/b");
    expect(vi.mocked(fetch).mock.lastCall![0]).toBe("https://openrouter.ai/api/v1/model/~a/b%2Fc%3Afree");
  });

  it("rejects an id with no author without calling OpenRouter", async () => {
    expect(await openRouter.lookupOpenRouterModel("gpt")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when the model doesn't exist or the call fails", async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response("", { status: 404 }));
    expect(await openRouter.lookupOpenRouterModel("a/nope")).toBeNull();

    vi.mocked(fetch).mockImplementation(async () => new Response("{}"));
    expect(await openRouter.lookupOpenRouterModel("a/nope")).toBeNull();

    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(await openRouter.lookupOpenRouterModel("a/b")).toBeNull();
  });
});

describe("formatModelPrice", () => {
  const price = (priceIn: number, priceOut: number) =>
    openRouter.formatModelPrice({ id: "", name: "", priceIn, priceOut, contextLength: 0 });

  it.each([
    [3, 15, "$3 in · $15 out /1M"],
    [10, 100, "$10 in · $100 out /1M"],
    [2.5, 0.25, "$2.5 in · $0.25 out /1M"],
    [0, 15, "? in · $15 out /1M"],
    [3, 0, "$3 in · ? out /1M"],
    [0, 0, ""],
    [-1, -1, ""],
  ])("formats %d in, %d out as %j", (priceIn, priceOut, expected) => {
    expect(price(priceIn, priceOut)).toBe(expected);
  });
});
