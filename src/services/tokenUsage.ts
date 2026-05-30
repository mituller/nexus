import { load } from "@tauri-apps/plugin-store";
import { format } from "date-fns";

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

// Approximate Bedrock pricing for Claude Sonnet models (per million tokens)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

async function getStore() {
  return load("nexus-settings.json");
}

export async function addTokenUsage(inputTokens: number, outputTokens: number): Promise<void> {
  try {
    const store = await getStore();
    const today = format(new Date(), "yyyy-MM-dd");
    const existing = await store.get<DailyUsage>("token_usage");

    if (!existing || existing.date !== today) {
      await store.set("token_usage", { date: today, inputTokens, outputTokens, callCount: 1 });
    } else {
      await store.set("token_usage", {
        date: today,
        inputTokens: existing.inputTokens + inputTokens,
        outputTokens: existing.outputTokens + outputTokens,
        callCount: existing.callCount + 1,
      });
    }
  } catch { /* never block the main call */ }
}

export async function getDailyUsage(): Promise<DailyUsage> {
  try {
    const store = await getStore();
    const today = format(new Date(), "yyyy-MM-dd");
    const usage = await store.get<DailyUsage>("token_usage");
    if (!usage || usage.date !== today) {
      return { date: today, inputTokens: 0, outputTokens: 0, callCount: 0 };
    }
    return usage;
  } catch {
    return { date: format(new Date(), "yyyy-MM-dd"), inputTokens: 0, outputTokens: 0, callCount: 0 };
  }
}

export function estimateCost(usage: DailyUsage): number {
  return (usage.inputTokens / 1_000_000) * INPUT_COST_PER_M +
         (usage.outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
