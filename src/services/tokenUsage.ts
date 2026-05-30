import { load } from "@tauri-apps/plugin-store";
import { format } from "date-fns";

export interface PeriodUsage {
  period: string; // YYYY-MM-DD for day, YYYY-MM for month
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
    const month = format(new Date(), "yyyy-MM");

    // Update daily
    const daily = await store.get<PeriodUsage>("token_usage_day");
    if (!daily || daily.period !== today) {
      await store.set("token_usage_day", { period: today, inputTokens, outputTokens, callCount: 1 });
    } else {
      await store.set("token_usage_day", {
        period: today,
        inputTokens: daily.inputTokens + inputTokens,
        outputTokens: daily.outputTokens + outputTokens,
        callCount: daily.callCount + 1,
      });
    }

    // Update monthly
    const monthly = await store.get<PeriodUsage>("token_usage_month");
    if (!monthly || monthly.period !== month) {
      await store.set("token_usage_month", { period: month, inputTokens, outputTokens, callCount: 1 });
    } else {
      await store.set("token_usage_month", {
        period: month,
        inputTokens: monthly.inputTokens + inputTokens,
        outputTokens: monthly.outputTokens + outputTokens,
        callCount: monthly.callCount + 1,
      });
    }
  } catch { /* never block the main call */ }
}

export async function getDailyUsage(): Promise<PeriodUsage> {
  try {
    const store = await getStore();
    const today = format(new Date(), "yyyy-MM-dd");
    // Support old key name for backwards compatibility
    const usage = await store.get<PeriodUsage>("token_usage_day") ??
                  await store.get<PeriodUsage>("token_usage");
    if (!usage || usage.period !== today) {
      return { period: today, inputTokens: 0, outputTokens: 0, callCount: 0 };
    }
    return usage;
  } catch {
    return { period: format(new Date(), "yyyy-MM-dd"), inputTokens: 0, outputTokens: 0, callCount: 0 };
  }
}

export async function getMonthlyUsage(): Promise<PeriodUsage> {
  try {
    const store = await getStore();
    const month = format(new Date(), "yyyy-MM");
    const usage = await store.get<PeriodUsage>("token_usage_month");
    if (!usage || usage.period !== month) {
      return { period: month, inputTokens: 0, outputTokens: 0, callCount: 0 };
    }
    return usage;
  } catch {
    return { period: format(new Date(), "yyyy-MM"), inputTokens: 0, outputTokens: 0, callCount: 0 };
  }
}

export function estimateCost(usage: PeriodUsage): number {
  return (usage.inputTokens / 1_000_000) * INPUT_COST_PER_M +
         (usage.outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}
