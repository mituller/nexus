import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { BedrockConfig } from "../types";
import { callClaude } from "./bedrock";
import { addTokenUsage } from "./tokenUsage";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./tokenUsage");

const messages = [{ role: "user" as const, content: "Hi" }];

const bedrock: BedrockConfig = {
  provider: "bedrock", profile: "p", region: "us-east-1", modelId: "m", openRouterApiKey: "", openRouterModel: "",
};
const openRouter: BedrockConfig = { ...bedrock, provider: "openrouter", openRouterApiKey: "key", openRouterModel: "a/b" };

describe("callClaude with Bedrock", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({
      content: [{ text: "Hello" }],
      usage: { input_tokens: 5, output_tokens: 7 },
    }));
  });

  it("calls the Tauri command with the profile, and returns the text", async () => {
    expect(await callClaude(bedrock, messages, 50)).toBe("Hello");
    expect(invoke).toHaveBeenCalledWith("invoke_bedrock", {
      profile: "p", region: "us-east-1", modelId: "m", messages, maxTokens: 50,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records token usage", async () => {
    await callClaude(bedrock, messages);
    expect(addTokenUsage).toHaveBeenCalledWith(5, 7);
  });

  it("returns an empty string for an empty reply, without recording usage it doesn't have", async () => {
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ content: [] }));
    expect(await callClaude(bedrock, messages)).toBe("");
    expect(addTokenUsage).not.toHaveBeenCalled();
  });

  it("passes on Bedrock errors", async () => {
    vi.mocked(invoke).mockRejectedValue("Bedrock error: denied");
    await expect(callClaude(bedrock, messages)).rejects.toBe("Bedrock error: denied");
  });
});

describe("callClaude with OpenRouter", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Hello" } }],
      usage: { prompt_tokens: 5, completion_tokens: 7 },
    })));
  });

  it("posts the model and messages with the key, and returns the text", async () => {
    expect(await callClaude(openRouter, messages, 50)).toBe("Hello");
    const [url, init] = vi.mocked(fetch).mock.lastCall as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer key" });
    expect(JSON.parse(init.body as string)).toEqual({ model: "a/b", max_tokens: 50, messages });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("records token usage", async () => {
    await callClaude(openRouter, messages);
    expect(addTokenUsage).toHaveBeenCalledWith(5, 7);
  });

  it("returns an empty string when there are no choices", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}"));
    expect(await callClaude(openRouter, messages)).toBe("");
  });

  it("includes the status when OpenRouter refuses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("no credit", { status: 402 }));
    await expect(callClaude(openRouter, messages)).rejects.toThrow("OpenRouter 402: no credit");
  });
});
