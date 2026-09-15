import { WikiPage, WikiPageDraft, BedrockConfig } from "../types";
import { callClaude } from "./bedrock";

async function callClaudePrompt(cfg: BedrockConfig, prompt: string, maxTokens = 2048): Promise<string> {
  return callClaude(cfg, [{ role: "user", content: prompt }], maxTokens);
}

function parseJson<T>(raw: string): T | null {
  try {
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return null;
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

// ─── Ingest ─────────────────────────────────────────────────────────────────

// Extract unique named speakers from transcript-style content (**Name** lines)
function extractSpeakers(content: string): string[] {
  const seen = new Set<string>();
  for (const m of content.matchAll(/^\*{1,2}([^*\n]+)\*{1,2}\s*$/gm)) {
    const name = m[1].trim();
    if (name && !/^Speaker\s*\d*$/i.test(name)) seen.add(name);
  }
  return [...seen];
}

// Strip HTML tags from content before sending to AI (removes timestamp spans, cleans input)
function stripHtmlTags(content: string): string {
  return content.replace(/<[^>]*>/g, '');
}

export async function ingestNoteToWiki(
  cfg: BedrockConfig,
  noteTitle: string,
  noteContent: string,
  existingPageTitles: string[]
): Promise<WikiPageDraft[]> {
  const existingList = existingPageTitles.slice(0, 50).join(", ") || "none";
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Pre-extract speakers from full content before truncation
  const speakers = extractSpeakers(noteContent);
  const speakerLine = speakers.length > 0 ? `PARTICIPANTS: ${speakers.join(", ")}\n` : "";

  // Strip HTML tags to reduce noise and save token budget for more content
  const cleanedContent = stripHtmlTags(noteContent);

  const prompt = `You maintain a personal knowledge wiki. Extract wiki-worthy entities from this note and generate wiki page content for each one.

NOTE TITLE: ${noteTitle}
NOTE DATE: ${today}
${speakerLine}NOTE CONTENT:
${cleanedContent.slice(0, 7000)}

EXISTING WIKI PAGES (titles only): ${existingList}

Return ONLY valid JSON (no markdown fences):
{
  "pages": [
    {
      "title": "Entity or topic name",
      "entityType": "person|project|concept|decision|meeting|general",
      "content": "Markdown content for this wiki page. Use ## sections. Use [[Other Page]] for cross-links.",
      "isNew": true
    }
  ]
}

Rules:
- Always extract named people (from PARTICIPANTS and content), named projects, and key decisions as separate pages
- Minimum 3-4 sentences of useful content per page — skip trivial mentions
- isNew: false if the title matches an existing wiki page, true if brand new
- For existing pages, write the full updated page integrating new info
- Cross-link related entities using [[Page Title]] syntax
- Max 8 pages per note

MEETING RULES:
If this note is a meeting transcript or meeting notes:
- ALWAYS create person pages for named participants (role, context from this meeting)
- ALWAYS create a project page for the project being discussed
- ADDITIONALLY create meeting page(s) as follows:
  - RECURRING meeting (standup, weekly check-in, 1:1, etc.): TWO pages —
    1. DATED page: "Meeting Name – ${today}", entityType "meeting", isNew true. Full notes from this session.
    2. PARENT SUMMARY: "Meeting Name" (no date), entityType "meeting". Purpose, regular attendees, recurring themes. No per-session details.
  - ONE-OFF meeting: ONE dated page — "Meeting Name – ${today}", entityType "meeting", isNew true. Full notes.`;

  const raw = await callClaudePrompt(cfg, prompt, 4000);
  const parsed = parseJson<{ pages: WikiPageDraft[] }>(raw);
  return parsed?.pages ?? [];
}

// ─── Query ───────────────────────────────────────────────────────────────────

export async function queryWiki(
  cfg: BedrockConfig,
  question: string,
  pages: WikiPage[]
): Promise<{ answer: string; citations: string[] }> {
  const pageContext = pages
    .slice(0, 30)
    .map((p) => `## ${p.title} (${p.entityType})\n${p.content.slice(0, 800)}`)
    .join("\n\n---\n\n");

  const prompt = `You are a personal knowledge assistant. Answer the question using ONLY the wiki content below. Cite page titles using [[Page Title]].

WIKI CONTENT:
${pageContext}

QUESTION: ${question}

Return ONLY valid JSON:
{
  "answer": "Your answer here, citing pages with [[Page Title]] where relevant.",
  "citations": ["Page Title 1", "Page Title 2"]
}

If the wiki doesn't contain enough information, say so clearly.`;

  const raw = await callClaudePrompt(cfg, prompt, 1024);
  const parsed = parseJson<{ answer: string; citations: string[] }>(raw);
  return parsed ?? { answer: raw, citations: [] };
}

// ─── Lint ────────────────────────────────────────────────────────────────────

export interface LintResult {
  orphanedPages: string[];
  missingPages: string[];
  stalePages: string[];
  suggestions: string[];
}

export async function lintWiki(
  cfg: BedrockConfig,
  pages: WikiPage[],
  noteCount: number,
  taskCount: number
): Promise<LintResult> {
  const orphanedPages = pages.filter((p) => p.sourceIds.length === 0).map((p) => p.title);

  const allTitles = new Set(pages.map((p) => p.title.toLowerCase()));
  const missingSet = new Set<string>();
  for (const page of pages) {
    const refs = page.content.match(/\[\[([^\]]+)\]\]/g) ?? [];
    for (const ref of refs) {
      const target = ref.slice(2, -2);
      if (!allTitles.has(target.toLowerCase())) missingSet.add(target);
    }
  }

  let suggestions: string[] = [];
  if (pages.length >= 3) {
    const titles = pages.map((p) => `${p.title} (${p.entityType})`).join(", ");
    const prompt = `You are reviewing a personal knowledge wiki with ${pages.length} pages: ${titles}
Notes processed: ${noteCount}, Tasks tracked: ${taskCount}
Orphaned pages: ${orphanedPages.join(", ") || "none"}
Broken cross-links: ${[...missingSet].join(", ") || "none"}

Suggest 3-5 specific improvements. Return ONLY valid JSON:
{"suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]}`;

    try {
      const raw = await callClaudePrompt(cfg, prompt, 512);
      const parsed = parseJson<{ suggestions: string[] }>(raw);
      suggestions = parsed?.suggestions ?? [];
    } catch { /* skip if Bedrock unavailable */ }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const stalePages = pages
    .filter((p) => p.updatedAt < thirtyDaysAgo && p.sourceIds.length > 0)
    .map((p) => p.title);

  return { orphanedPages, missingPages: [...missingSet], stalePages, suggestions };
}
