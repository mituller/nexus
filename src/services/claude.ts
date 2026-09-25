import { CalendarEvent, Task, DailyBriefing, HeadsUpItem, ExtractedNoteData, TaskPriority, AppSettings, BedrockConfig } from "../types";
import type { GitIssue } from "../types/git";
import { format, isBefore, parseISO } from "date-fns";
import { callClaude } from "./bedrock";

/** Build the AI provider config from app settings. */
export function aiConfigFromSettings(settings: AppSettings): BedrockConfig {
  return {
    provider: settings.aiProvider,
    profile: settings.bedrockProfile,
    region: settings.bedrockRegion,
    modelId: settings.bedrockModelId,
    openRouterApiKey: settings.openRouterApiKey,
    openRouterModel: settings.openRouterModel,
  };
}

/** True when the selected provider has everything it needs to make a call. */
export function hasAIConfig(cfg: BedrockConfig): boolean {
  if (cfg.provider === "openrouter") {
    return !!(cfg.openRouterApiKey && cfg.openRouterModel);
  }
  return !!(cfg.profile && cfg.region && cfg.modelId);
}

export async function generateDailyBriefing(
  cfg: BedrockConfig,
  userName: string,
  todayEvents: CalendarEvent[],
  tomorrowEvents: CalendarEvent[],
  tasks: Task[],
  gitIssues: GitIssue[] = []
): Promise<DailyBriefing> {
  const now = new Date();
  const today = format(now, "EEEE, MMMM d, yyyy");
  const h = now.getHours();
  const timeOfDay = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const timeStr = `${format(now, "h:mm a")} (${timeOfDay})`;

  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate && isBefore(parseISO(t.dueDate), now)
  );
  const highPriorityTasks = openTasks.filter((t) => t.priority === "high");

  // For the narrative, only show events still upcoming or in progress — not already finished
  const upcomingToday = todayEvents.filter((e) => parseISO(e.end) > now);
  const tentativeToday = upcomingToday.filter((e) => e.isTentative);

  const headsUp: HeadsUpItem[] = [];

  for (const t of overdueTasks) {
    headsUp.push({
      type: "overdue",
      message: `Overdue task: "${t.title}" — was due ${t.dueDate ? format(parseISO(t.dueDate), "MMM d") : "recently"}.`,
      taskId: t.id,
    });
  }

  // Overdue git items
  for (const i of gitIssues.filter(i => i.dueDate && isBefore(parseISO(i.dueDate), now)).slice(0, 3)) {
    headsUp.push({
      type: "overdue",
      message: `Overdue Git: "${i.title}" — due ${format(parseISO(i.dueDate!), "MMM d")}.`,
      url: i.webUrl,
    });
  }

  if (tentativeToday.length > 0) {
    const names = tentativeToday.map((e) => e.title).join(" and ");
    headsUp.push({ type: "tentative", message: `Tentative: ${names} — you may want to confirm attendance.` });
  }

  // Back-to-back detection
  const sorted = [...todayEvents].sort((a, b) => a.start.localeCompare(b.start));
  let streakStart = -1, streakLen = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapMs = parseISO(sorted[i + 1].start).getTime() - parseISO(sorted[i].end).getTime();
    if (gapMs <= 5 * 60 * 1000) {
      if (streakLen === 0) streakStart = i;
      streakLen++;
    } else {
      if (streakLen >= 2) {
        const start = format(parseISO(sorted[streakStart].start), "h:mm a");
        const end = format(parseISO(sorted[streakStart + streakLen].end), "h:mm a");
        const names = sorted.slice(streakStart, streakStart + streakLen + 1).map((e) => e.title).join(" → ");
        headsUp.push({ type: "back_to_back", message: `Back-to-back: ${start}–${end} (${names}) with no gaps.` });
      }
      streakLen = 0;
    }
  }

  const tomorrowTentative = tomorrowEvents.filter((e) => e.isTentative);
  for (const e of tomorrowTentative.slice(0, 2)) {
    headsUp.push({ type: "tomorrow", message: `Tomorrow: ${e.title} (${format(parseISO(e.start), "h:mm a")}) — still tentative.` });
  }

  let narrative = "";
  try {
    narrative = await callClaude(cfg, [{ role: "user", content: buildNarrativePrompt(userName, today, timeStr, upcomingToday, tomorrowEvents, openTasks, gitIssues) }]);
  } catch (e) {
    narrative = `Unable to generate narrative — check your AI settings (provider: ${cfg.provider === "openrouter" ? "OpenRouter" : "Bedrock"}).`;
  }

  return {
    stats: {
      meetingsToday: todayEvents.length,
      highPriorityTasks: highPriorityTasks.length,
      overdueTasks: overdueTasks.length,
      unreadAlerts: headsUp.length,
    },
    headsUp,
    narrative,
    generatedAt: now.toISOString(),
  };
}

function buildNarrativePrompt(
  name: string,
  today: string,
  timeOfDay: string,
  todayEvents: CalendarEvent[],
  tomorrowEvents: CalendarEvent[],
  tasks: Task[],
  gitIssues: GitIssue[] = []
): string {
  const meetingList = todayEvents
    .map((e) => `- ${e.title} (${format(parseISO(e.start), "h:mm a")}–${format(parseISO(e.end), "h:mm a")}, ${e.isOrganizer ? "organizer" : "attendee"}${e.isTentative ? ", tentative" : ""})`)
    .join("\n");
  const taskList = tasks.slice(0, 6).map((t) => `- ${t.title} [${t.priority}${t.dueDate ? `, due ${t.dueDate}` : ""}]`).join("\n");
  const tomorrowList = tomorrowEvents.slice(0, 3).map((e) => `- ${e.title} (${format(parseISO(e.start), "h:mm a")})`).join("\n");
  const issueList = gitIssues.slice(0, 5).map((i) => `- ${i.title} [${i.priority ?? "medium"}, ${i.projectName}${i.dueDate ? `, due ${i.dueDate}` : ""}]`).join("\n");

  return `You are a smart daily briefing assistant. Write a concise, helpful narrative for ${name}. Current time: ${timeOfDay} on ${today}. Do NOT start with a greeting — the app already shows one. The meetings listed are UPCOMING (not yet ended). Be specific and actionable. 3-4 short paragraphs max. Flowing prose only — no bullet points.

TODAY'S MEETINGS:
${meetingList || "No meetings today."}

OPEN TASKS (top priority):
${taskList || "No open tasks."}

GIT ITEMS:
${issueList || "None."}

TOMORROW'S MEETINGS:
${tomorrowList || "No meetings tomorrow."}`;
}

// ─── Note / transcript extraction ───────────────────────────────────────────

export async function extractFromNote(
  cfg: BedrockConfig,
  title: string,
  content: string,
  isTranscript = false
): Promise<ExtractedNoteData> {
  const type = isTranscript ? "meeting transcript" : "note";
  const prompt = `You are a productivity assistant. Analyze this ${type} and extract structured data.

TITLE: ${title}
CONTENT:
${content.slice(0, 8000)}

Return ONLY valid JSON (no markdown fences):
{
  "tasks": [
    {
      "title": "string — specific action item",
      "priority": "high" | "medium" | "low",
      "dueDate": "YYYY-MM-DD or null",
      "tags": ["string"]
    }
  ],
  "summary": "2-3 sentence summary of key points and decisions",
  "entities": ["person names", "project names", "key topics mentioned"]
}

Rules:
- Only include clear, specific action items as tasks
- Priority: high = urgent/blocking, medium = this week, low = someday
- dueDate: only if explicitly mentioned, else null
- tasks array can be empty if no action items found`;

  const raw = await callClaude(cfg, [{ role: "user", content: prompt }]);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]) as {
      tasks: Array<{ title: string; priority: string; dueDate: string | null; tags: string[] }>;
      summary: string;
      entities: string[];
    };
    return {
      tasks: parsed.tasks.map((t) => ({
        title: t.title,
        priority: (["high", "medium", "low"].includes(t.priority) ? t.priority : "medium") as TaskPriority,
        dueDate: t.dueDate ?? undefined,
        tags: t.tags ?? [],
      })),
      summary: parsed.summary ?? "",
      entities: parsed.entities ?? [],
    };
  } catch {
    return { tasks: [], summary: "", entities: [] };
  }
}

// ─── VTT / transcript cleaning ───────────────────────────────────────────────

// UUID-style Teams cue IDs like "ba33dcbe-cd01-4481-8eb6-cb579022ce22/130-1"
const UUID_CUE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/[\w-]+)?$/i;

function formatVttTimestamp(vttTime: string, isAbsoluteUtc: boolean): string {
  const m = vttTime.match(/(\d+):(\d+):(\d+)/);
  if (!m) return "";
  const h = parseInt(m[1]), min = parseInt(m[2]);

  if (isAbsoluteUtc) {
    // Convert absolute UTC time to CST (America/Chicago)
    const d = new Date();
    d.setUTCHours(h, min, 0, 0);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZone: "America/Chicago",
    });
  }
  // Relative elapsed time — show as H:MM or M:SS
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}`;
  return `${min}:${String(parseInt(m[3])).padStart(2, "0")}`;
}

export function cleanTranscriptText(raw: string): string {
  const blocks = raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const segments: { speaker: string; text: string; time: string }[] = [];

  // Detect whether timestamps are absolute UTC (hours >= 6) after scanning first cue
  let isAbsoluteUtc: boolean | null = null;

  for (const block of blocks) {
    if (/^WEBVTT/i.test(block) || /^NOTE\b/i.test(block)) continue;

    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

    // Extract timestamp line and skip UUID cue IDs / plain cue numbers
    let time = "";
    const textLines: string[] = [];
    for (const line of lines) {
      if (UUID_CUE_RE.test(line)) continue;       // UUID cue identifier
      if (/^\d+$/.test(line)) continue;            // numeric cue identifier
      if (/^\d{2}:\d{2}:\d{2}/.test(line)) {       // timestamp line
        const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2})/);
        if (tsMatch) {
          const h = parseInt(tsMatch[1].split(":")[0]);
          if (isAbsoluteUtc === null) isAbsoluteUtc = h >= 6;
          time = formatVttTimestamp(tsMatch[1], isAbsoluteUtc ?? false);
        }
        continue;
      }
      textLines.push(line);
    }

    if (textLines.length === 0) continue;
    let text = textLines.join(" ");

    // Extract speaker from <v Speaker Name> tag
    const speakerMatch = text.match(/^<v\s+([^>]+)>([\s\S]*)/);
    let speaker = "";
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      text = speakerMatch[2];
    }

    // Strip remaining VTT tags
    text = text
      .replace(/<\d{2}:\d{2}:\d{2}\.\d+>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!text) continue;
    segments.push({ speaker, text, time });
  }

  if (segments.length === 0) {
    return raw
      .replace(/^WEBVTT.*$/gm, "")
      .replace(/^\d{2}:\d{2}[\d:.,\s-->]+$/gm, "")
      .replace(/^NOTE\b.*$/gm, "")
      .replace(UUID_CUE_RE.source, "")
      .replace(/^\d+$/gm, "")
      .replace(/<[^>]+>/g, "")
      .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  }

  // Merge consecutive same-speaker lines; keep the first timestamp of each group
  const merged: { speaker: string; text: string; time: string }[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.text += " " + seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  // Format: **Speaker** (time): text
  return merged
    .map(({ speaker, text, time }) => {
      if (!speaker) return text;
      const timeStr = time ? ` (${time})` : "";
      return `**${speaker}**${timeStr}: ${text}`;
    })
    .join("\n\n");
}
