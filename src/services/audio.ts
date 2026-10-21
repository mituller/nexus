import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { BedrockConfig, TranscriptSegment } from "../types";

export interface RecordingInfo {
  sampleRate: number;
  channels: number;
  format: string;
}

export interface TranscriptUpdate {
  /** `partial` replaces the in-flight turns, `final` appends settled turns. */
  kind: "partial" | "final" | "ended" | "error";
  segments: TranscriptSegment[];
  message: string | null;
}

export const TRANSCRIPT_EVENT = "transcribe:update";

/** Start capturing the microphone. Resolves once the device is live. */
export function startRecording(): Promise<RecordingInfo> {
  return invoke<RecordingInfo>("start_recording");
}

/** Stop capture and persist the audio as a WAV. Resolves with the file path. */
export function stopRecording(): Promise<string> {
  return invoke<string>("stop_recording");
}

/** Peak amplitude (0..1) of the most recent audio frame, for the level meter. */
export function audioLevel(): Promise<number> {
  return invoke<number>("audio_level");
}

/**
 * Opens an Amazon Transcribe streaming session that consumes the running
 * recording, with speaker diarization enabled. Requires the AWS profile/region
 * used for Bedrock — transcription is independent of the AI provider setting.
 */
export function startTranscription(
  cfg: BedrockConfig,
  language: string,
  sampleRate: number
): Promise<string> {
  return invoke<string>("start_transcription", {
    profile: cfg.profile,
    region: cfg.region,
    language,
    sampleRate,
  });
}

/** Ends the session; Transcribe flushes its remaining results first. */
export function stopTranscription(): Promise<void> {
  return invoke<void>("stop_transcription");
}

/** Subscribe to live transcript updates. */
export function onTranscriptUpdate(
  cb: (update: TranscriptUpdate) => void
): Promise<UnlistenFn> {
  return listen<TranscriptUpdate>(TRANSCRIPT_EVENT, (event) => cb(event.payload));
}

/** True when the AWS credentials needed by Transcribe are configured. */
export function hasTranscriptionConfig(cfg: BedrockConfig): boolean {
  return !!(cfg.profile && cfg.region);
}

const LANGUAGE_OPTIONS = [
  "en-US",
  "en-GB",
  "en-AU",
  "en-IN",
  "de-DE",
  "es-ES",
  "es-US",
  "fr-FR",
  "fr-CA",
  "it-IT",
  "pt-BR",
  "ru-RU",
  "ja-JP",
  "ko-KR",
  "hi-IN",
  "zh-CN",
];

export function transcriptionLanguages(): string[] {
  return LANGUAGE_OPTIONS;
}
