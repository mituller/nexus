import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSettings, BedrockConfig, CalendarEvent, DEFAULT_SETTINGS, Task } from "../types";
import { GitIssue } from "../types/git";
import { callClaude } from "./bedrock";
import {
  aiConfigFromSettings, cleanTranscriptText, extractFromNote, generateDailyBriefing, hasAIConfig,
} from "./claude";

vi.mock("./bedrock");

const bedrock: BedrockConfig = {
  provider: "bedrock", profile: "p", region: "r", modelId: "m", openRouterApiKey: "", openRouterModel: "",
};

function event(title: string, startHour: number, endHour: number, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: title, title,
    start: new Date(2026, 5, 15, startHour).toISOString(),
    end: new Date(2026, 5, 15, endHour).toISOString(),
    isOrganizer: false, isTentative: false, attendees: [], feedId: "f", feedLabel: "F", color: "c",
    ...overrides,
  };
}

function task(title: string, overrides: Partial<Task> = {}): Task {
  return { id: title, title, status: "open", priority: "medium", tags: [], createdAt: "c", updatedAt: "u", ...overrides };
}

function issue(title: string, dueDate?: string): GitIssue {
  return {
    id: title, iid: 1, title, state: "opened", webUrl: `https://x/${title}`, projectName: "app", projectPath: "acme/app",
    labels: [], issueType: "issue", dueDate, createdAt: "c", updatedAt: "u", provider: "github",
  };
}

function lastPrompt(): string {
  return vi.mocked(callClaude).mock.lastCall![1][0].content;
}

describe("AI config", () => {
  it("copies the provider settings", () => {
    const settings: AppSettings = { ...DEFAULT_SETTINGS, aiProvider: "openrouter", openRouterApiKey: "key", openRouterModel: "a/b" };
    expect(aiConfigFromSettings(settings)).toEqual({
      provider: "openrouter",
      profile: settings.bedrockProfile,
      region: settings.bedrockRegion,
      modelId: settings.bedrockModelId,
      openRouterApiKey: "key",
      openRouterModel: "a/b",
    });
  });

  it.each([
    [bedrock, true],
    [{ ...bedrock, profile: "" }, false],
    [{ ...bedrock, region: "" }, false],
    [{ ...bedrock, modelId: "" }, false],
    [{ ...bedrock, provider: "openrouter" as const }, false],
    [{ ...bedrock, provider: "openrouter" as const, openRouterApiKey: "k" }, false],
    [{ ...bedrock, provider: "openrouter" as const, openRouterApiKey: "k", openRouterModel: "a/b" }, true],
  ])("hasAIConfig(%j) is %s", (cfg, expected) => {
    expect(hasAIConfig(cfg)).toBe(expected);
  });
});

describe("generateDailyBriefing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    vi.mocked(callClaude).mockResolvedValue("Narrative");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function briefing(today: CalendarEvent[] = [], tomorrow: CalendarEvent[] = [], tasks: Task[] = [], issues: GitIssue[] = []) {
    return generateDailyBriefing(bedrock, "Ann", today, tomorrow, tasks, issues);
  }

  it("counts meetings and open tasks", async () => {
    const result = await briefing(
      [event("A", 9, 10), event("B", 14, 15)],
      [],
      [
        task("high", { priority: "high" }),
        task("done high", { priority: "high", status: "done" }),
        task("late", { dueDate: "2026-06-01" }),
        task("done late", { dueDate: "2026-06-01", status: "done" }),
        task("future", { dueDate: "2026-07-01" }),
      ],
    );
    expect(result.stats).toEqual({ meetingsToday: 2, highPriorityTasks: 1, overdueTasks: 1, unreadAlerts: 1 });
    expect(result.narrative).toBe("Narrative");
  });

  it("a task due today isn't overdue yet", async () => {
    const result = await briefing([], [], [task("today", { dueDate: "2026-06-15" })]);
    expect(result.stats.overdueTasks).toBe(0);
  });

  it("doesn't alert on a git issue due today", async () => {
    const { headsUp } = await briefing([], [], [], [issue("today", "2026-06-15")]);
    expect(headsUp).toEqual([]);
  });

  it("links an overdue task's alert to the task", async () => {
    const { headsUp } = await briefing([], [], [task("late", { dueDate: "2026-06-01" })]);
    expect(headsUp).toEqual([
      { type: "overdue", message: 'Overdue task: "late" — was due Jun 1.', taskId: "late" },
    ]);
  });

  it("alerts on at most three overdue git issues, with their URLs", async () => {
    const { headsUp } = await briefing([], [], [], [
      issue("a", "2026-06-01"), issue("b", "2026-06-02"), issue("c", "2026-06-03"),
      issue("d", "2026-06-04"), issue("future", "2026-07-01"), issue("no date"),
    ]);
    expect(headsUp.map((h) => h.url)).toEqual(["https://x/a", "https://x/b", "https://x/c"]);
  });

  it("only warns about tentative meetings that haven't finished", async () => {
    const { headsUp } = await briefing([
      event("Past", 9, 10, { isTentative: true }),
      event("Later", 14, 15, { isTentative: true }),
      event("Also", 16, 17, { isTentative: true }),
    ]);
    expect(headsUp.find((h) => h.type === "tentative")?.message).toContain("Later and Also");
    expect(headsUp.find((h) => h.type === "tentative")?.message).not.toContain("Past");
  });

  it("warns about at most two tentative meetings tomorrow", async () => {
    const { headsUp } = await briefing([], [
      event("A", 9, 10, { isTentative: true }), event("B", 10, 11, { isTentative: true }),
      event("C", 11, 12, { isTentative: true }), event("Firm", 12, 13),
    ]);
    expect(headsUp.filter((h) => h.type === "tomorrow").map((h) => h.message)).toEqual([
      "Tomorrow: A (9:00 AM) — still tentative.",
      "Tomorrow: B (10:00 AM) — still tentative.",
    ]);
  });

  describe("back-to-back meetings", () => {
    it("reports three or more meetings with no gaps", async () => {
      const { headsUp } = await briefing([event("C", 11, 12), event("A", 9, 10), event("B", 10, 11), event("Later", 15, 16)]);
      expect(headsUp.filter((h) => h.type === "back_to_back").map((h) => h.message)).toEqual([
        "Back-to-back: 9:00 AM–12:00 PM (A → B → C) with no gaps.",
      ]);
    });

    it("doesn't report two meetings in a row", async () => {
      const { headsUp } = await briefing([event("A", 9, 10), event("B", 10, 11), event("Later", 15, 16)]);
      expect(headsUp.filter((h) => h.type === "back_to_back")).toEqual([]);
    });

    it("reports a run of meetings that lasts until the end of the day", async () => {
      const { headsUp } = await briefing([event("A", 13, 14), event("B", 14, 15), event("C", 15, 16)]);
      expect(headsUp.filter((h) => h.type === "back_to_back").map((h) => h.message)).toEqual([
        "Back-to-back: 1:00 PM–4:00 PM (A → B → C) with no gaps.",
      ]);
    });

    it("reports each separate run", async () => {
      const { headsUp } = await briefing([
        event("A", 8, 9), event("B", 9, 10), event("C", 10, 11),
        event("D", 13, 14), event("E", 14, 15), event("F", 15, 16),
      ]);
      expect(headsUp.filter((h) => h.type === "back_to_back")).toHaveLength(2);
    });
  });

  it("gives the AI what's still ahead, not what's finished", async () => {
    await briefing(
      [event("Finished", 9, 10), event("Ongoing", 11, 13, { isOrganizer: true })],
      [event("Tomorrow's", 9, 10)],
      [task("Open"), task("Closed", { status: "done" })],
      [issue("Bug", "2026-07-01")],
    );
    const prompt = lastPrompt();
    expect(prompt).toContain("Ann");
    expect(prompt).toContain("Monday, June 15, 2026");
    expect(prompt).toContain("(afternoon)");
    expect(prompt).toContain("- Ongoing (11:00 AM–1:00 PM, organizer)");
    expect(prompt).not.toContain("Finished");
    expect(prompt).toContain("- Open [medium]");
    expect(prompt).not.toContain("Closed");
    expect(prompt).toContain("- Bug [medium, app, due 2026-07-01]");
    expect(prompt).toContain("- Tomorrow's (9:00 AM)");
  });

  it("says when there's nothing to report", async () => {
    await briefing();
    const prompt = lastPrompt();
    expect(prompt).toContain("No meetings today.");
    expect(prompt).toContain("No open tasks.");
    expect(prompt).toContain("None.");
    expect(prompt).toContain("No meetings tomorrow.");
  });

  it("still returns stats when the AI call fails, naming the provider", async () => {
    vi.mocked(callClaude).mockRejectedValue(new Error("denied"));
    const bedrockResult = await briefing([event("A", 14, 15)]);
    expect(bedrockResult.stats.meetingsToday).toBe(1);
    expect(bedrockResult.narrative).toContain("provider: Bedrock");

    const openRouterResult = await generateDailyBriefing({ ...bedrock, provider: "openrouter" }, "Ann", [], [], []);
    expect(openRouterResult.narrative).toContain("provider: OpenRouter");
  });
});

describe("extractFromNote", () => {
  const reply = {
    tasks: [{ title: "Do it", priority: "high", dueDate: "2026-07-01", tags: ["x"] }],
    summary: "Sum",
    entities: ["Ann"],
  };

  it("parses the reply", async () => {
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify(reply));
    expect(await extractFromNote(bedrock, "T", "C")).toEqual({
      tasks: [{ title: "Do it", priority: "high", dueDate: "2026-07-01", tags: ["x"] }],
      summary: "Sum",
      entities: ["Ann"],
    });
  });

  it("finds the JSON inside surrounding text or code fences", async () => {
    vi.mocked(callClaude).mockResolvedValue("Here you go:\n```json\n" + JSON.stringify(reply) + "\n```");
    expect((await extractFromNote(bedrock, "T", "C")).summary).toBe("Sum");
  });

  it("fills in missing or invalid task fields", async () => {
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify({
      tasks: [{ title: "Do it", priority: "urgent", dueDate: null }],
    }));
    expect(await extractFromNote(bedrock, "T", "C")).toEqual({
      tasks: [{ title: "Do it", priority: "medium", dueDate: undefined, tags: [] }],
      summary: "",
      entities: [],
    });
  });

  it.each(["no json here", "{not valid}", '{"summary":"no task list"}'])("returns nothing for %j", async (raw) => {
    vi.mocked(callClaude).mockResolvedValue(raw);
    expect(await extractFromNote(bedrock, "T", "C")).toEqual({ tasks: [], summary: "", entities: [] });
  });

  it("describes the source, and sends at most 8000 characters", async () => {
    vi.mocked(callClaude).mockResolvedValue("{}");
    await extractFromNote(bedrock, "T", "a".repeat(9000), true);
    expect(lastPrompt()).toContain("meeting transcript");
    expect(lastPrompt()).toContain("a".repeat(8000));
    expect(lastPrompt()).not.toContain("a".repeat(8001));

    await extractFromNote(bedrock, "T", "C");
    expect(lastPrompt()).toContain("Analyze this note");
  });

  it("passes on a failed AI call, so the caller can show it", async () => {
    vi.mocked(callClaude).mockRejectedValue(new Error("denied"));
    await expect(extractFromNote(bedrock, "T", "C")).rejects.toThrow("denied");
  });
});

describe("cleanTranscriptText", () => {
  it("removes cue ids and timestamps, and labels speakers with elapsed time", () => {
    const vtt = `WEBVTT

NOTE a comment

ba33dcbe-cd01-4481-8eb6-cb579022ce22/130-1
00:05:30.000 --> 00:05:32.000
<v Ann>Hello there</v>

2
00:05:40.000 --> 00:05:42.000
<v Bob>Hi</v>`;
    expect(cleanTranscriptText(vtt)).toBe("**Ann** (5:30): Hello there\n\n**Bob** (5:40): Hi");
  });

  it("merges a speaker's consecutive cues and keeps the first time", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
<v Ann>One

00:00:03.000 --> 00:00:04.000
<v Ann>two

00:00:05.000 --> 00:00:06.000
<v Bob>three

00:00:07.000 --> 00:00:08.000
<v Ann>four`;
    expect(cleanTranscriptText(vtt)).toBe("**Ann** (0:01): One two\n\n**Bob** (0:05): three\n\n**Ann** (0:07): four");
  });

  it("shows hours for a long meeting", () => {
    expect(cleanTranscriptText("00:00:01.000 --> 00:00:02.000\n<v Ann>a\n\n01:05:30.000 --> 01:05:31.000\n<v Bob>b"))
      .toBe("**Ann** (0:01): a\n\n**Bob** (1:05): b");
  });

  it("strips inline timing and styling tags", () => {
    const vtt = "00:00:01.000 --> 00:00:02.000\n<v Ann>Hello <00:00:01.500><c.loud>world</c>";
    expect(cleanTranscriptText(vtt)).toBe("**Ann** (0:01): Hello world");
  });

  it("joins lines with no speaker as plain text", () => {
    expect(cleanTranscriptText("00:00:01.000 --> 00:00:02.000\nOne\ntwo\n\n00:00:03.000 --> 00:00:04.000\nthree"))
      .toBe("One two three");
  });

  it("keeps plain text with no cues", () => {
    expect(cleanTranscriptText("Just some notes")).toBe("Just some notes");
  });

  it("returns nothing for a transcript with no speech", () => {
    expect(cleanTranscriptText("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000")).toBe("");
  });

  it("removes UUID cue ids when a transcript has no speech", () => {
    const vtt = "WEBVTT\n\nba33dcbe-cd01-4481-8eb6-cb579022ce22/130-1\n00:00:01.000 --> 00:00:02.000";
    expect(cleanTranscriptText(vtt)).toBe("");
  });

  describe("clock-time cues", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    // Tests run in New York, where 15:30 UTC in June is 11:30 AM.
    it("shows them in the user's timezone", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-06-15T16:00:00Z"));
      expect(cleanTranscriptText("15:30:00.000 --> 15:30:02.000\n<v Ann>Hi")).toBe("**Ann** (11:30 AM): Hi");
    });
  });
});
