import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callClaude } from "../services/bedrock";
import { getCachedWeeklyNarrative, saveCachedWeeklyNarrative } from "../services/store";
import { CalendarEvent, Task } from "../types";
import { GitIssue } from "../types/git";
import { useCalendarStore } from "./calendar";
import { useGitStore } from "./git";
import { useSettingsStore } from "./settings";
import { useTaskStore } from "./tasks";
import { useWeeklyStore } from "./weekly";

vi.mock("../services/bedrock");
vi.mock("../services/store");
vi.mock("../services/db");
vi.mock("../services/github");
vi.mock("../services/gitlab");
vi.mock("../services/ical");

const TODAY = "2026-06-15";
const fetchEventsForRange = vi.fn();
const state = () => useWeeklyStore.getState();

function task(title: string, dueDate?: string, overrides: Partial<Task> = {}): Task {
  return { id: title, title, status: "open", priority: "high", dueDate, tags: [], createdAt: "c", updatedAt: "u", ...overrides };
}

function issue(title: string, dueDate?: string): GitIssue {
  return {
    id: title, iid: 1, title, state: "opened", webUrl: "u", projectName: "app", projectPath: "acme/app",
    labels: [], issueType: "issue", dueDate, createdAt: "c", updatedAt: "u", provider: "github",
  };
}

function event(title: string, day: number, hour: number): CalendarEvent {
  const start = new Date(2026, 5, day, hour).toISOString();
  return { id: title, title, start, end: start, isOrganizer: false, isTentative: false, attendees: [], feedId: "f", feedLabel: "F", color: "c" };
}

function lastPrompt(): string {
  return vi.mocked(callClaude).mock.lastCall![1][0].content;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
  vi.spyOn(console, "error").mockImplementation(() => {});
  useWeeklyStore.setState(useWeeklyStore.getInitialState(), true);
  useTaskStore.setState({ tasks: [] });
  useGitStore.setState({ issues: [] });
  useCalendarStore.setState({ fetchEventsForRange });
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getInitialState().settings,
      userName: "Ann", bedrockProfile: "p", bedrockRegion: "r", bedrockModelId: "m",
    },
  });
  fetchEventsForRange.mockReset();
  fetchEventsForRange.mockResolvedValue([]);
  vi.mocked(callClaude).mockResolvedValue("The week");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("load", () => {
  it("uses today's cached narrative", async () => {
    vi.mocked(getCachedWeeklyNarrative).mockResolvedValue({ weekKey: TODAY, narrative: "Cached", generatedAt: "t" });
    await state().load();
    expect(state()).toMatchObject({ narrative: "Cached", generatedAt: "t", weekKey: TODAY });
  });

  it("ignores an older one", async () => {
    vi.mocked(getCachedWeeklyNarrative).mockResolvedValue({ weekKey: "2026-06-14", narrative: "Old", generatedAt: "t" });
    await state().load();
    expect(state().narrative).toBe("");
  });

  it("copes with no cache", async () => {
    vi.mocked(getCachedWeeklyNarrative).mockResolvedValue(null);
    await state().load();
    expect(state().narrative).toBe("");
  });
});

describe("generate", () => {
  it("does nothing without AI config", async () => {
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, bedrockProfile: "" } });
    await state().generate();
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("saves the narrative and caches it under today's key", async () => {
    await state().generate();
    expect(state()).toMatchObject({ narrative: "The week", loading: false, weekKey: TODAY });
    expect(state().generatedAt).toBeTruthy();
    expect(saveCachedWeeklyNarrative).toHaveBeenCalledWith(TODAY, "The week");
  });

  it("only regenerates the same day when forced", async () => {
    await state().generate();
    await state().generate();
    expect(callClaude).toHaveBeenCalledTimes(1);

    await state().generate(true);
    expect(callClaude).toHaveBeenCalledTimes(2);
  });

  it("regenerates on a new day", async () => {
    await state().generate();
    vi.setSystemTime(new Date(2026, 5, 16, 12));
    await state().generate();
    expect(callClaude).toHaveBeenCalledTimes(2);
    expect(state().weekKey).toBe("2026-06-16");
  });

  it("asks for the seven days starting today", async () => {
    await state().generate();
    const [start, end] = fetchEventsForRange.mock.lastCall!;
    expect(start).toEqual(new Date(2026, 5, 15));
    expect(end).toEqual(new Date(2026, 5, 21));
  });

  it("lists each day's events, in local time", async () => {
    fetchEventsForRange.mockResolvedValue([event("Planning", 16, 9), event("Late call", 16, 22)]);
    await state().generate();
    const prompt = lastPrompt();
    expect(prompt).toContain("Week of June 15, 2026");
    expect(prompt).toContain("for Ann.");
    expect(prompt).toContain("Tue Jun 16: 9:00 AM Planning, 10:00 PM Late call");
    expect(prompt).toContain("Mon Jun 15: clear");
  });

  it("includes open tasks and issues due or overdue this week", async () => {
    useTaskStore.setState({ tasks: [
      task("Overdue task", "2026-06-01"),
      task("This week task", "2026-06-18"),
      task("Next month task", "2026-07-20"),
      task("Undated task"),
      task("Finished task", "2026-06-18", { status: "done" }),
    ] });
    useGitStore.setState({ issues: [
      issue("Overdue issue", "2026-06-01"), issue("Next month issue", "2026-07-20"), issue("Undated issue"),
    ] });

    await state().generate();

    const prompt = lastPrompt();
    expect(prompt).toContain("- Overdue task [high, due 2026-06-01]");
    expect(prompt).toContain("- This week task [high, due 2026-06-18]");
    expect(prompt).not.toContain("Next month task");
    expect(prompt).not.toContain("Undated task");
    expect(prompt).not.toContain("Finished task");
    expect(prompt).toContain("- Overdue issue [app, due 2026-06-01]");
    expect(prompt).not.toContain("Next month issue");
    expect(prompt).not.toContain("Undated issue");
  });

  it("says None when nothing is due, and has a default name", async () => {
    useSettingsStore.setState({ settings: { ...useSettingsStore.getState().settings, userName: "" } });
    await state().generate();
    expect(lastPrompt()).toContain("for the user.");
    expect(lastPrompt()).toContain("TASKS DUE OR OVERDUE THIS WEEK:\nNone");
    expect(lastPrompt()).toContain("GIT ITEMS DUE:\nNone");
  });

  it("stops loading and keeps the old narrative when the AI call fails", async () => {
    useWeeklyStore.setState({ narrative: "Old" });
    vi.mocked(callClaude).mockRejectedValue(new Error("denied"));
    await state().generate(true);
    expect(state().narrative).toBe("Old");
    expect(state().loading).toBe(false);
    expect(saveCachedWeeklyNarrative).not.toHaveBeenCalled();
  });
});
