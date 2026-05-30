import { invoke } from "@tauri-apps/api/core";
import { BedrockConfig } from "../types";

interface Message {
  role: "user" | "assistant";
  content: string;
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
  const data = JSON.parse(raw) as { content: Array<{ text: string }> };
  return data.content[0]?.text ?? "";
}
