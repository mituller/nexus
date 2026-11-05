import { beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "@tauri-apps/plugin-store";
import { DEFAULT_SETTINGS } from "../types";
import {
  getCachedBriefing, getCachedWeeklyNarrative, getSettings, saveCachedBriefing,
  saveCachedWeeklyNarrative, saveSettings,
} from "./store";

vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }));

const fake = { get: vi.fn(), set: vi.fn() };

beforeEach(() => {
  fake.get.mockReset();
  fake.set.mockReset();
  vi.mocked(load).mockResolvedValue(fake as never);
});

describe("settings", () => {
  it("returns the defaults when nothing is saved", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(load).toHaveBeenCalledWith("nexus-settings.json");
  });

  it("fills settings added since the last save with their defaults", async () => {
    fake.get.mockResolvedValue({ userName: "Ann" });
    const settings = await getSettings();
    expect(settings.userName).toBe("Ann");
    expect(settings.gitProvider).toBe(DEFAULT_SETTINGS.gitProvider);
  });

  it("saves under the settings key", async () => {
    await saveSettings(DEFAULT_SETTINGS);
    expect(fake.set).toHaveBeenCalledWith("settings", DEFAULT_SETTINGS);
  });
});

describe("cached briefings", () => {
  it("stores the daily briefing with a timestamp", async () => {
    await saveCachedBriefing("Today");
    expect(fake.set).toHaveBeenCalledWith("daily_briefing", { briefing: "Today", generatedAt: expect.any(String) });

    fake.get.mockResolvedValue({ briefing: "Today", generatedAt: "t" });
    expect(await getCachedBriefing()).toEqual({ briefing: "Today", generatedAt: "t" });
  });

  it("stores the weekly narrative with its key", async () => {
    await saveCachedWeeklyNarrative("2026-06-01", "Week");
    expect(fake.set).toHaveBeenCalledWith("weekly_narrative", {
      weekKey: "2026-06-01", narrative: "Week", generatedAt: expect.any(String),
    });
  });

  it("returns null when there's no weekly narrative", async () => {
    expect(await getCachedWeeklyNarrative()).toBeNull();
  });
});
