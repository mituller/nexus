import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BedrockConfig, WikiPage } from "../types";
import { callClaude } from "./bedrock";
import { ingestNoteToWiki, lintWiki, queryWiki } from "./wikiAI";

vi.mock("./bedrock");

const cfg: BedrockConfig = {
  provider: "bedrock", profile: "p", region: "r", modelId: "m", openRouterApiKey: "", openRouterModel: "",
};

function page(title: string, overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    id: title, title, content: "", entityType: "general", tags: [], sourceIds: ["n1"],
    createdAt: "c", updatedAt: new Date().toISOString(), ...overrides,
  };
}

function lastPrompt(): string {
  return vi.mocked(callClaude).mock.lastCall![1][0].content;
}

beforeEach(() => {
  vi.mocked(callClaude).mockResolvedValue("{}");
});

describe("ingestNoteToWiki", () => {
  const draft = { title: "Ann", entityType: "person", content: "About Ann", isNew: true };

  it("returns the pages from the reply", async () => {
    vi.mocked(callClaude).mockResolvedValue("Sure!\n" + JSON.stringify({ pages: [draft] }));
    expect(await ingestNoteToWiki(cfg, "T", "C", [])).toEqual([draft]);
  });

  it.each(["not json", "{broken}", "{}"])("returns no pages for %j", async (raw) => {
    vi.mocked(callClaude).mockResolvedValue(raw);
    expect(await ingestNoteToWiki(cfg, "T", "C", [])).toEqual([]);
  });

  it("includes the title, today's date and up to 50 existing pages", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 15, 12));
    const titles = Array.from({ length: 51 }, (_, i) => `Page${i}`);
    await ingestNoteToWiki(cfg, "Standup", "C", titles);
    vi.useRealTimers();

    expect(lastPrompt()).toContain("NOTE TITLE: Standup");
    expect(lastPrompt()).toContain("NOTE DATE: June 15, 2026");
    expect(lastPrompt()).toContain("Page49");
    expect(lastPrompt()).not.toContain("Page50");
  });

  it("says when there are no existing pages", async () => {
    await ingestNoteToWiki(cfg, "T", "C", []);
    expect(lastPrompt()).toContain("EXISTING WIKI PAGES (titles only): none");
  });

  it("removes HTML before cutting the content to 7000 characters", async () => {
    await ingestNoteToWiki(cfg, "T", `<span class="ts">Body</span>${"a".repeat(8000)}`, []);
    expect(lastPrompt()).toContain(`Body${"a".repeat(6996)}\n`);
    expect(lastPrompt()).not.toContain("<span");
  });

  describe("participants", () => {
    it("lists speakers on their own lines, without generic labels", async () => {
      await ingestNoteToWiki(cfg, "T", "**Ann**\nHello\n\n**Speaker 1**\nHi\n\n**Bob**\nHey\n\n**Ann**\nBye", []);
      expect(lastPrompt()).toContain("PARTICIPANTS: Ann, Bob\n");
    });

    it("leaves the line out when there are no speakers", async () => {
      await ingestNoteToWiki(cfg, "T", "Just notes", []);
      expect(lastPrompt()).not.toContain("PARTICIPANTS:");
    });

    it("finds speakers in imported VTT transcripts", async () => {
      await ingestNoteToWiki(cfg, "T", "**Ann** (5:30): Hello\n\n**Bob** (5:40): Hi", []);
      expect(lastPrompt()).toContain("PARTICIPANTS: Ann, Bob\n");
    });

    it("finds speakers in recorded transcripts", async () => {
      await ingestNoteToWiki(cfg, "T", "## Transcript\n\n**Ann:** Hello\n\n**Speaker 2:** Hi\n\n**Unknown speaker:** Hey\n\n**Bob:** Bye", []);
      expect(lastPrompt()).toContain("PARTICIPANTS: Ann, Bob\n");
    });

    it("doesn't mistake bold labels in other notes for speakers", async () => {
      await ingestNoteToWiki(cfg, "T", "**Date:** Monday\n**Organizer:** You\n\n**Note**: call back\n\n## Notes\n**Decision:** Ship it", []);
      expect(lastPrompt()).not.toContain("PARTICIPANTS:");
    });
  });
});

describe("queryWiki", () => {
  it("returns the answer and citations", async () => {
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify({ answer: "Yes [[Ann]]", citations: ["Ann"] }));
    expect(await queryWiki(cfg, "Who?", [page("Ann")])).toEqual({ answer: "Yes [[Ann]]", citations: ["Ann"] });
  });

  it("uses the raw reply as the answer when it isn't JSON", async () => {
    vi.mocked(callClaude).mockResolvedValue("I don't know.");
    expect(await queryWiki(cfg, "Who?", [])).toEqual({ answer: "I don't know.", citations: [] });
  });

  it("sends at most 30 pages and 800 characters of each", async () => {
    const pages = Array.from({ length: 31 }, (_, i) => page(`Page${i}`, { content: "x".repeat(900) }));
    await queryWiki(cfg, "Who?", pages);
    expect(lastPrompt()).toContain("QUESTION: Who?");
    expect(lastPrompt()).toContain("## Page29 (general)");
    expect(lastPrompt()).not.toContain("Page30");
    expect(lastPrompt()).toContain(`${"x".repeat(800)}\n`);
    expect(lastPrompt()).not.toContain("x".repeat(801));
  });
});

describe("lintWiki", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("finds pages with no source note", async () => {
    const result = await lintWiki(cfg, [page("A", { sourceIds: [] }), page("B")], 0, 0);
    expect(result.orphanedPages).toEqual(["A"]);
  });

  it("finds broken links, ignoring case and listing each once", async () => {
    const result = await lintWiki(cfg, [
      page("A", { content: "[[b]] and [[Missing]]" }),
      page("B", { content: "[[Missing]]" }),
    ], 0, 0);
    expect(result.missingPages).toEqual(["Missing"]);
  });

  it("finds pages not updated for 30 days, except orphans", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-30T00:00:00Z"));
    const result = await lintWiki(cfg, [
      page("Old", { updatedAt: "2026-05-01T00:00:00Z" }),
      page("Recent", { updatedAt: "2026-06-29T00:00:00Z" }),
      page("Old orphan", { updatedAt: "2026-05-01T00:00:00Z", sourceIds: [] }),
    ], 0, 0);
    expect(result.stalePages).toEqual(["Old"]);
  });

  it("only asks the AI once there are three pages", async () => {
    await lintWiki(cfg, [page("A"), page("B")], 0, 0);
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("includes the AI's suggestions", async () => {
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify({ suggestions: ["Merge A and B"] }));
    const result = await lintWiki(cfg, [page("A", { content: "[[Gone]]" }), page("B"), page("C", { sourceIds: [] })], 4, 5);
    expect(result.suggestions).toEqual(["Merge A and B"]);
    expect(lastPrompt()).toContain("Notes processed: 4, Tasks tracked: 5");
    expect(lastPrompt()).toContain("Orphaned pages: C");
    expect(lastPrompt()).toContain("Broken cross-links: Gone");
  });

  it("still reports the local checks when the AI call fails", async () => {
    vi.mocked(callClaude).mockRejectedValue(new Error("down"));
    const result = await lintWiki(cfg, [page("A", { sourceIds: [] }), page("B"), page("C")], 0, 0);
    expect(result.suggestions).toEqual([]);
    expect(result.orphanedPages).toEqual(["A"]);
  });
});
