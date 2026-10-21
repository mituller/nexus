import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, X, Loader2, Sparkles, Check, Copy, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useNotesStore } from "../../stores/notes";
import { useSettingsStore } from "../../stores/settings";
import { aiConfigFromSettings, hasAIConfig } from "../../services/claude";
import { callClaude } from "../../services/bedrock";
import {
  audioLevel,
  hasTranscriptionConfig,
  onTranscriptUpdate,
  startRecording,
  startTranscription,
  stopRecording,
  stopTranscription,
  type RecordingInfo,
} from "../../services/audio";
import type { TranscriptSegment } from "../../types";

const SPEAKER_COLORS = [
  "#3b82f6",
  "#a855f7",
  "#f97316",
  "#14b8a6",
  "#ec4899",
  "#ef4444",
  "#eab308",
  "#22c55e",
];

const UNKNOWN = "unknown";

interface RecorderPanelProps {
  onClose: () => void;
}

type Status = "idle" | "starting" | "recording" | "stopping" | "done";

export function RecorderPanel({ onClose }: RecorderPanelProps) {
  const { create, setActive } = useNotesStore();
  const { settings } = useSettingsStore();
  const cfg = aiConfigFromSettings(settings);
  const awsReady = hasTranscriptionConfig(cfg);

  const [status, setStatus] = useState<Status>("idle");
  const [info, setInfo] = useState<RecordingInfo | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [finalized, setFinalized] = useState<TranscriptSegment[]>([]);
  const [partial, setPartial] = useState<TranscriptSegment[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [wavPath, setWavPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const startedAtRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  // ─── Live transcript subscription ──────────────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onTranscriptUpdate((update) => {
      if (update.kind === "partial") {
        setPartial(update.segments);
      } else if (update.kind === "final") {
        setFinalized((prev) => [...prev, ...update.segments]);
        setPartial([]);
      } else if (update.kind === "error") {
        if (activeRef.current) setError(update.message ?? "Transcription stopped");
        setPartial([]);
      } else {
        setPartial([]);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // ─── Timer + level meter ──────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
      audioLevel()
        .then(setLevel)
        .catch(() => {});
    }, 120);
    return () => clearInterval(timer);
  }, [status]);

  // ─── Controls ─────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    setError(null);
    setStatus("starting");
    setFinalized([]);
    setPartial([]);
    setLabels({});
    setWavPath(null);
    setElapsed(0);
    try {
      const recording = await startRecording();
      setInfo(recording);
      startedAtRef.current = Date.now();
      activeRef.current = true;
      setStatus("recording");

      if (awsReady) {
        try {
          await startTranscription(cfg, settings.transcribeLanguage, recording.sampleRate);
        } catch (e) {
          setError(String(e));
        }
      }
    } catch (e) {
      setError(String(e));
      setStatus("idle");
    }
  }, [awsReady, cfg, settings.transcribeLanguage]);

  const handleStop = useCallback(async () => {
    setStatus("stopping");
    activeRef.current = false;
    try {
      await stopTranscription();
    } catch {
      /* session may already be over */
    }
    try {
      const path = await stopRecording();
      setWavPath(path);
    } catch (e) {
      setError(String(e));
    }
    setLevel(0);
    setStatus("done");
  }, []);

  const handleCancel = useCallback(async () => {
    activeRef.current = false;
    try {
      await stopTranscription();
    } catch {
      /* ignore */
    }
    try {
      await stopRecording();
    } catch {
      /* ignore */
    }
    onClose();
  }, [onClose]);

  // ─── Speaker labels ───────────────────────────────────────────────────────
  const speakerIds = useMemo(() => {
    const seen: string[] = [];
    for (const seg of [...finalized, ...partial]) {
      if (!seen.includes(seg.speaker)) seen.push(seg.speaker);
    }
    return seen;
  }, [finalized, partial]);

  const labelFor = useCallback(
    (speaker: string, index: number) =>
      labels[speaker]?.trim() ||
      (speaker === UNKNOWN ? "Unknown speaker" : `Speaker ${index + 1}`),
    [labels]
  );

  const colorFor = useCallback(
    (speaker: string) =>
      speaker === UNKNOWN
        ? "#9ca3af"
        : SPEAKER_COLORS[speakerIds.indexOf(speaker) % SPEAKER_COLORS.length],
    [speakerIds]
  );

  async function handleSuggestNames() {
    if (!hasAIConfig(cfg) || finalized.length === 0) return;
    setSuggesting(true);
    setError(null);
    try {
      const reply = await callClaude(
        cfg,
        [
          {
            role: "user",
            content:
              "A meeting transcript is below. Each line is prefixed with an anonymous speaker id " +
              "(spk_0, spk_1, …) already replaced by a placeholder name. Work out each speaker's real " +
              "name when the conversation reveals it (someone is addressed by name, introduces " +
              "themselves, or is referred to unambiguously). Reply with ONLY a JSON object mapping the " +
              'speaker id to a first name, e.g. {"spk_0":"Maria","spk_1":"Tom"}. Omit speakers you ' +
              "cannot identify with confidence.\n\n" +
              finalized.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
          },
        ],
        512
      );
      const match = reply.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Record<string, string>;
        setLabels((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      setError(`Could not suggest names: ${String(e)}`);
    } finally {
      setSuggesting(false);
    }
  }

  // ─── Save as a note ───────────────────────────────────────────────────────
  async function handleSave() {
    if (finalized.length === 0) return;
    setSaving(true);
    try {
      const body = finalized
        .map(
          (seg) =>
            `**${labelFor(seg.speaker, speakerIds.indexOf(seg.speaker))}:** ${seg.text.trim()}`
        )
        .join("\n\n");
      const footer = wavPath ? `\n\n_Audio recording: \`${wavPath}\`_` : "";
      const note = await create({
        title: `Recording: ${format(new Date(), "MMM d, yyyy h:mm a")}`,
        content: `## Transcript\n\n${body}${footer}`,
        tags: ["transcript", "recording"],
        sourceType: "transcript",
      });
      setActive(note.id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeLabel = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const recording = status === "recording" || status === "stopping";
  const showEmptyHint = finalized.length === 0 && partial.length === 0 && !error;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={recording ? undefined : onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
            <Mic size={15} className={recording ? "text-red-500" : "text-gray-400"} />
            Record audio
            {recording && (
              <span className="flex items-center gap-1.5 text-xs font-normal text-red-500">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {timeLabel}
              </span>
            )}
          </h2>
          <button
            onClick={recording ? handleCancel : onClose}
            title={recording ? "Discard recording" : "Close"}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {status === "idle" || status === "starting" ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <button
                onClick={handleStart}
                disabled={status === "starting"}
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white flex items-center justify-center transition-colors shadow-lg"
              >
                {status === "starting" ? (
                  <Loader2 size={28} className="animate-spin" />
                ) : (
                  <Mic size={30} />
                )}
              </button>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {status === "starting" ? "Starting microphone…" : "Start recording"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-md">
                {awsReady ? (
                  <>
                    Transcribes live and labels each voice with Amazon Transcribe, so you can
                    rename <em>Speaker 1</em>, <em>Speaker 2</em>… as you go. Audio is saved as a
                    WAV file next to your notes.
                  </>
                ) : (
                  <>
                    No AWS profile configured, so the recording will not be transcribed. Add an
                    AWS profile in Settings to get speaker-labelled transcripts.
                  </>
                )}
              </p>
            </div>
          ) : (
            <>
              {/* Level meter */}
              {recording && (
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-[width] duration-100"
                    style={{ width: `${Math.min(100, Math.round(level * 130))}%` }}
                  />
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {error}
                    {recording && " — the audio itself is still being recorded."}
                  </span>
                </div>
              )}

              {/* Speakers */}
              {speakerIds.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Voices detected — name them
                    </p>
                    {hasAIConfig(cfg) && (
                      <button
                        onClick={handleSuggestNames}
                        disabled={suggesting || finalized.length === 0}
                        className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-40"
                      >
                        {suggesting ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Sparkles size={11} />
                        )}
                        Guess names with AI
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {speakerIds.map((speaker, i) => (
                      <div
                        key={speaker}
                        className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: colorFor(speaker) }}
                        />
                        <input
                          value={labels[speaker] ?? ""}
                          onChange={(e) =>
                            setLabels((prev) => ({ ...prev, [speaker]: e.target.value }))
                          }
                          placeholder={labelFor(speaker, i)}
                          className="w-28 bg-transparent text-xs text-gray-700 dark:text-gray-200 outline-none placeholder-gray-400 dark:placeholder-gray-500"
                        />
                        <span className="text-[10px] text-gray-300 dark:text-gray-600">
                          {speaker}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcript */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3 min-h-40 max-h-80 overflow-y-auto space-y-2.5">
                {showEmptyHint && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
                    {recording
                      ? awsReady
                        ? "Listening… words appear here as they are spoken."
                        : "Recording audio only — no transcription configured."
                      : "No speech was transcribed."}
                  </p>
                )}
                {[...finalized, ...partial].map((seg, i) => {
                  const isPartial = i >= finalized.length;
                  const index = speakerIds.indexOf(seg.speaker);
                  return (
                    <div
                      key={`${i}-${seg.startMs}`}
                      className={`text-sm leading-relaxed ${isPartial ? "opacity-50" : ""}`}
                    >
                      <span
                        className="font-semibold mr-1.5"
                        style={{ color: colorFor(seg.speaker) }}
                      >
                        {labelFor(seg.speaker, index)}:
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">{seg.text}</span>
                    </div>
                  );
                })}
              </div>

              {/* Saved file */}
              {wavPath && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Check size={12} className="text-green-500 shrink-0" />
                  <span className="truncate font-mono">{wavPath}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(wavPath);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="shrink-0 hover:text-gray-700 dark:hover:text-gray-200"
                    title="Copy path"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {info && status !== "idle" && (
              <>
                {info.sampleRate / 1000} kHz · {info.channels === 1 ? "mono" : `${info.channels} ch`}
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            {recording && (
              <button
                onClick={handleStop}
                disabled={status === "stopping"}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
              >
                {status === "stopping" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Square size={12} />
                )}
                Stop
              </button>
            )}
            {status === "done" && (
              <>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || finalized.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-40 transition-colors"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  Create note from transcript
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
