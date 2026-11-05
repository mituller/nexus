import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings, saveSettings } from "../services/store";
import { DEFAULT_SETTINGS } from "../types";
import { useSettingsStore } from "./settings";

vi.mock("../services/store");

beforeEach(() => {
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
});

describe("useSettingsStore", () => {
  it("starts on the defaults, not yet loaded", () => {
    const { settings, loaded } = useSettingsStore.getState();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(loaded).toBe(false);
  });

  it("loads saved settings", async () => {
    vi.mocked(getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, userName: "Sam" });
    await useSettingsStore.getState().load();
    const { settings, loaded } = useSettingsStore.getState();
    expect(settings.userName).toBe("Sam");
    expect(loaded).toBe(true);
  });

  it("merges an update and saves the whole result", async () => {
    await useSettingsStore.getState().update({ userName: "Sam" });
    const expected = { ...DEFAULT_SETTINGS, userName: "Sam" };
    expect(useSettingsStore.getState().settings).toEqual(expected);
    expect(saveSettings).toHaveBeenCalledWith(expected);
  });
});
