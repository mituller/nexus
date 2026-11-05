import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "@tauri-apps/plugin-store";
import {
  addTokenUsage, estimateCost, formatCost, formatTokens, getDailyUsage, getMonthlyUsage,
} from "./tokenUsage";

vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }));

let saved: Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
  saved = {};
  vi.mocked(load).mockResolvedValue({
    get: async (key: string) => saved[key],
    set: async (key: string, value: unknown) => { saved[key] = value; },
  } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("addTokenUsage", () => {
  it("starts the day and month on the first call", async () => {
    await addTokenUsage(10, 20);
    const expected = { inputTokens: 10, outputTokens: 20, callCount: 1 };
    expect(saved.token_usage_day).toEqual({ period: "2026-06-15", ...expected });
    expect(saved.token_usage_month).toEqual({ period: "2026-06", ...expected });
  });

  it("adds to the current period", async () => {
    await addTokenUsage(10, 20);
    await addTokenUsage(1, 2);
    expect(saved.token_usage_day).toMatchObject({ inputTokens: 11, outputTokens: 22, callCount: 2 });
    expect(saved.token_usage_month).toMatchObject({ inputTokens: 11, outputTokens: 22, callCount: 2 });
  });

  it("restarts the day but keeps the month on a new day", async () => {
    await addTokenUsage(10, 20);
    vi.setSystemTime(new Date(2026, 5, 16, 12));
    await addTokenUsage(1, 2);
    expect(saved.token_usage_day).toEqual({ period: "2026-06-16", inputTokens: 1, outputTokens: 2, callCount: 1 });
    expect(saved.token_usage_month).toMatchObject({ inputTokens: 11, callCount: 2 });
  });

  it("never throws, so it can't break an AI call", async () => {
    vi.mocked(load).mockRejectedValue(new Error("disk full"));
    await expect(addTokenUsage(1, 2)).resolves.toBeUndefined();
  });
});

describe("reading usage", () => {
  const zero = { inputTokens: 0, outputTokens: 0, callCount: 0 };

  it("returns the current period's usage", async () => {
    await addTokenUsage(10, 20);
    expect(await getDailyUsage()).toMatchObject({ inputTokens: 10 });
    expect(await getMonthlyUsage()).toMatchObject({ inputTokens: 10 });
  });

  it("reads the old key name for daily usage", async () => {
    saved.token_usage = { period: "2026-06-15", inputTokens: 4, outputTokens: 5, callCount: 1 };
    expect(await getDailyUsage()).toMatchObject({ inputTokens: 4 });
  });

  it("returns zero once the period has passed", async () => {
    await addTokenUsage(10, 20);
    vi.setSystemTime(new Date(2026, 6, 1, 12));
    expect(await getDailyUsage()).toEqual({ period: "2026-07-01", ...zero });
    expect(await getMonthlyUsage()).toEqual({ period: "2026-07", ...zero });
  });

  it("returns zero when the store can't be read", async () => {
    vi.mocked(load).mockRejectedValue(new Error("locked"));
    expect(await getDailyUsage()).toEqual({ period: "2026-06-15", ...zero });
    expect(await getMonthlyUsage()).toEqual({ period: "2026-06", ...zero });
  });
});

describe("formatting", () => {
  it("prices input and output tokens per million", () => {
    expect(estimateCost({ period: "p", inputTokens: 1_000_000, outputTokens: 1_000_000, callCount: 1 })).toBe(18);
  });

  it.each([
    [999, "999"],
    [1500, "1.5k"],
    [2_500_000, "2.50M"],
  ])("formats %d tokens as %s", (n, expected) => {
    expect(formatTokens(n)).toBe(expected);
  });

  it.each([
    [0, "$0.00"],
    [0.001, "<$0.01"],
    [1.234, "$1.23"],
  ])("formats a cost of %d as %s", (cost, expected) => {
    expect(formatCost(cost)).toBe(expected);
  });
});
