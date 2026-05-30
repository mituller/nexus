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
