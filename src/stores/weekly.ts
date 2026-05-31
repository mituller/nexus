import { create } from "zustand";
import { format, startOfWeek } from "date-fns";
import { getCachedWeeklyNarrative, saveCachedWeeklyNarrative } from "../services/store";
import { callClaude } from "../services/bedrock";
import { useSettingsStore } from "./settings";
import { useCalendarStore } from "./calendar";
import { useTaskStore } from "./tasks";
import { useGitLabStore } from "./gitlab";
import { useFreshserviceStore } from "./freshservice";
import { format as dateFmt, addDays, parseISO, isBefore } from "date-fns";

function currentWeekKey(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

interface WeeklyStore {
  narrative: string;
  loading: boolean;
  generatedAt: string | null;
  weekKey: string | null;
  load: () => Promise<void>;
  generate: (force?: boolean) => Promise<void>;
}

export const useWeeklyStore = create<WeeklyStore>((set, get) => ({
  narrative: "",
  loading: false,
  generatedAt: null,
  weekKey: null,

  // Load cached narrative from disk — call this on app startup
  load: async () => {
    const cached = await getCachedWeeklyNarrative();
    if (cached && cached.weekKey === currentWeekKey()) {
      set({ narrative: cached.narrative, generatedAt: cached.generatedAt, weekKey: cached.weekKey });
    }
  },

  // Generate (or regenerate) the weekly narrative
  generate: async (force = false) => {
    const { settings } = useSettingsStore.getState();
    const cfg = { profile: settings.bedrockProfile, region: settings.bedrockRegion, modelId: settings.bedrockModelId };
    if (!cfg.profile || !cfg.region || !cfg.modelId) return;

    const weekKey = currentWeekKey();

    // Skip if already generated for this week (unless forced)
    if (!force && get().weekKey === weekKey && get().narrative) return;

    set({ loading: true });
    try {
      const now = new Date();
      const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(now, { weekStartsOn: 1 }), i));
      const weekStart = days[0];
      const weekEnd = days[days.length - 1];

      // Gather data from all stores
      const { fetchEventsForRange } = useCalendarStore.getState();
      const { tasks } = useTaskStore.getState();
      const { issues } = useGitLabStore.getState();
      const { tickets } = useFreshserviceStore.getState();

      const weekEvents = await fetchEventsForRange(weekStart, weekEnd);
      const openTasks = tasks.filter((t) => t.status !== "done");

      const dueThisWeek = openTasks.filter((t) => {
        if (!t.dueDate) return false;
        const d = parseISO(t.dueDate);
        return (isBefore(d, now) || (d >= weekStart && d <= weekEnd));
      });

      const dueIssues = issues.filter((i) => {
        if (!i.dueDate) return false;
        const d = parseISO(i.dueDate);
        return (isBefore(d, now) || (d >= weekStart && d <= weekEnd));
      });

      const dueTickets = tickets.filter((t) => {
        if (!t.dueBy) return false;
        const d = parseISO(t.dueBy);
        return (isBefore(d, now) || (d >= weekStart && d <= weekEnd));
      });

      // Build calendar summary by day
      const calendarSummary = days.map((day) => {
        const str = dateFmt(day, "yyyy-MM-dd");
        const dayEvents = weekEvents
          .filter((e) => dateFmt(new Date(e.start), "yyyy-MM-dd") === str)
          .map((e) => `${dateFmt(parseISO(e.start), "h:mm a")} ${e.title}`)
          .join(", ");
        return `${dateFmt(day, "EEE MMM d")}: ${dayEvents || "clear"}`;
      }).join("\n");

      const taskSummary = dueThisWeek.slice(0, 8)
        .map((t) => `- ${t.title} [${t.priority}${t.dueDate ? `, due ${t.dueDate}` : ""}]`)
        .join("\n");

      const issueSummary = dueIssues.slice(0, 5)
        .map((i) => `- ${i.title} [${i.projectName}${i.dueDate ? `, due ${i.dueDate}` : ""}]`)
        .join("\n");

      const ticketSummary = dueTickets.slice(0, 5)
        .map((t) => `- #${t.id} ${t.subject} [${t.statusLabel}${t.dueBy ? `, due ${t.dueBy}` : ""}]`)
        .join("\n");

      const prompt = `You are a weekly planning assistant. Write a concise week-ahead briefing for ${settings.userName || "the user"}. Week of ${dateFmt(weekStart, "MMMM d, yyyy")}.

CALENDAR:
${calendarSummary}

TASKS DUE OR OVERDUE THIS WEEK:
${taskSummary || "None"}

GITLAB ITEMS DUE:
${issueSummary || "None"}

FRESHSERVICE TICKETS DUE:
${ticketSummary || "None"}

Write 3-4 focused paragraphs: busiest/lightest days, key priorities to tackle, anything needing prep. Do NOT start with a greeting. Flowing prose, no bullet points.`;

      const narrative = await callClaude(cfg, [{ role: "user", content: prompt }], 1024);

      set({ narrative, loading: false, generatedAt: new Date().toISOString(), weekKey });
      await saveCachedWeeklyNarrative(weekKey, narrative);
    } catch (e) {
      console.error("Failed to generate weekly narrative:", e);
      set({ loading: false });
    }
  },
}));
