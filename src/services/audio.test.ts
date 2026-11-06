import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BedrockConfig } from "../types";
import {
  audioLevel, hasTranscriptionConfig, onTranscriptUpdate, startRecording, startTranscription,
  stopRecording, stopTranscription, transcriptionLanguages,
} from "./audio";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

// Transcription always uses the AWS settings, even with OpenRouter selected.
const cfg: BedrockConfig = {
  provider: "openrouter", profile: "p", region: "r", modelId: "", openRouterApiKey: "k", openRouterModel: "a/b",
};

describe("audio commands", () => {
  it("calls the matching Tauri commands", async () => {
    await startRecording();
    expect(invoke).toHaveBeenLastCalledWith("start_recording");
    await stopRecording();
    expect(invoke).toHaveBeenLastCalledWith("stop_recording");
    await audioLevel();
    expect(invoke).toHaveBeenLastCalledWith("audio_level");
    await stopTranscription();
    expect(invoke).toHaveBeenLastCalledWith("stop_transcription");
  });

  it("starts transcription with the AWS profile and region", async () => {
    await startTranscription(cfg, "en-US", 16000);
    expect(invoke).toHaveBeenCalledWith("start_transcription", {
      profile: "p", region: "r", language: "en-US", sampleRate: 16000,
    });
  });

  it("passes each transcript event's payload to the callback", async () => {
    const callback = vi.fn();
    await onTranscriptUpdate(callback);
    const [eventName, handler] = vi.mocked(listen).mock.lastCall!;
    expect(eventName).toBe("transcribe:update");

    const update = { kind: "final", segments: [], message: null };
    handler({ event: "transcribe:update", id: 1, payload: update });
    expect(callback).toHaveBeenCalledWith(update);
  });
});

describe("hasTranscriptionConfig", () => {
  it.each([
    [cfg, true],
    [{ ...cfg, profile: "" }, false],
    [{ ...cfg, region: "" }, false],
  ])("for %j is %s", (config, expected) => {
    expect(hasTranscriptionConfig(config)).toBe(expected);
  });
});

describe("transcriptionLanguages", () => {
  it("includes the default language", () => {
    expect(transcriptionLanguages()).toContain("en-US");
  });
});
