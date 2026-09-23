import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { BedrockConfig } from "../types";
import { addTokenUsage } from "./tokenUsage";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface BedrockResponse {
  content: Array<{ text: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function callClaude(
  cfg: BedrockConfig,
  messages: Message[],
  maxTokens = 1024
): Promise<string> {
  if (cfg.provider === "openrouter") {
    return callOpenRouter(cfg, messages, maxTokens);
  }

  const raw = await invoke<string>("invoke_bedrock", {
    profile: cfg.profile,
    region: cfg.region,
    modelId: cfg.modelId,
    messages,
    maxTokens,
  });
  const data = JSON.parse(raw) as BedrockResponse;

  // Track token usage automatically — fire-and-forget, never blocks the call
  if (data.usage) {
    addTokenUsage(data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
  }

  return data.content[0]?.text ?? "";
}

/**
 * OpenRouter (https://openrouter.ai) — OpenAI-compatible endpoint. The app's
 * webview already has blanket `https://**` HTTP scope (see capabilities), so
 * this goes straight through the Tauri http plugin with no CORS concerns.
 */
async function callOpenRouter(
  cfg: BedrockConfig,
  messages: Message[],
  maxTokens: number
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.openRouterApiKey}`,
      "Content-Type": "application/json",
      // OpenRouter uses these only for rankings/stats — set them so calls
      // show up as coming from Nexus instead of "curl".
      "X-Title": "Nexus",
      "HTTP-Referer": "https://github.com/mituller/nexus",
    },
    body: JSON.stringify({
      model: cfg.openRouterModel,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (data.usage) {
    addTokenUsage(data.usage.prompt_tokens ?? 0, data.usage.completion_tokens ?? 0);
  }

  return data.choices?.[0]?.message?.content ?? "";
}
