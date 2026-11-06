//! Live transcription with speaker diarization via Amazon Transcribe streaming.
//!
//! Audio never leaves the machine as a file — the capture callback feeds mono
//! 16-bit PCM straight into the Transcribe event stream, and every transcript
//! event is re-emitted to the webview as `transcribe:update`. Speaker labels
//! (`spk_0`, `spk_1`, …) come from Transcribe's speaker partitioning; naming
//! them is up to the UI.

use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::task::{Context, Poll};

use aws_sdk_transcribestreaming::primitives::event_stream::EventStreamSender;
use aws_sdk_transcribestreaming::primitives::Blob;
use aws_sdk_transcribestreaming::types::error::AudioStreamError;
use aws_sdk_transcribestreaming::types::{
    AudioEvent, AudioStream, Item, ItemType, LanguageCode, MediaEncoding, TranscriptResultStream,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio_stream::Stream;

use crate::audio;

/// One contiguous stretch of speech from a single speaker.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub speaker: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

/// Payload of the `transcribe:update` event.
///
/// `kind` is one of `partial` (replace the in-flight segment list), `final`
/// (append to the settled list), `ended` or `error`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptUpdate {
    pub kind: &'static str,
    pub segments: Vec<Segment>,
    pub message: Option<String>,
}

struct Session {
    id: String,
    /// Kept alive so the audio event stream stays open; dropping it makes
    /// Transcribe flush and close the session.
    #[allow(dead_code)]
    tx: tokio::sync::mpsc::Sender<Vec<u8>>,
}

static SESSION: OnceLock<Mutex<Option<Session>>> = OnceLock::new();
static COUNTER: AtomicU64 = AtomicU64::new(1);

fn session_slot() -> &'static Mutex<Option<Session>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

/// Wraps the PCM channel in the event stream the SDK expects.
struct PcmStream {
    rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
}

impl Stream for PcmStream {
    type Item = Result<AudioStream, AudioStreamError>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match self.rx.poll_recv(cx) {
            Poll::Ready(Some(bytes)) => Poll::Ready(Some(Ok(AudioStream::AudioEvent(
                AudioEvent::builder().audio_chunk(Blob::new(bytes)).build(),
            )))),
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Opens a diarized streaming transcription session and starts feeding it the
/// microphone. Returns a session id.
pub async fn start(
    app: AppHandle,
    profile: String,
    region: String,
    language: String,
    sample_rate: u32,
) -> Result<String, String> {
    if !audio::is_recording() {
        return Err("Start recording before turning on transcription".into());
    }
    if session_slot().lock().map(|s| s.is_some()).unwrap_or(true) {
        return Err("A transcription session is already running".into());
    }

    let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .profile_name(&profile)
        .region(aws_config::Region::new(region))
        .load()
        .await;
    let client = aws_sdk_transcribestreaming::Client::new(&sdk_config);

    // 64 × ~100 ms of audio of headroom before we start dropping frames.
    let (tx, rx) = tokio::sync::mpsc::channel::<Vec<u8>>(64);

    let mut output = client
        .start_stream_transcription()
        .language_code(LanguageCode::from(language.as_str()))
        .media_sample_rate_hertz(sample_rate as i32)
        .media_encoding(MediaEncoding::Pcm)
        .show_speaker_label(true)
        .audio_stream(EventStreamSender::from(PcmStream { rx }))
        .send()
        .await
        .map_err(|e| format!("Transcribe could not start: {e}"))?;

    let id = format!("session-{}", COUNTER.fetch_add(1, Ordering::Relaxed));

    // Aggregate the callback's tiny buffers into ~100 ms audio events, which is
    // what Transcribe expects (max 1 s per event).
    let sink_tx = tx.clone();
    let acc: Mutex<Vec<i16>> = Mutex::new(Vec::new());
    let chunk_samples = ((sample_rate / 10).max(160)) as usize;
    let max_buffered = chunk_samples * 200; // ~20 s of backlog, then give up
    let sink: audio::PcmSink = std::sync::Arc::new(move |samples: &[i16]| {
        let Ok(mut buf) = acc.lock() else { return };
        buf.extend_from_slice(samples);
        while buf.len() >= chunk_samples {
            let mut bytes = Vec::with_capacity(chunk_samples * 2);
            for sample in buf.drain(..chunk_samples) {
                bytes.extend_from_slice(&sample.to_le_bytes());
            }
            if sink_tx.try_send(bytes).is_err() {
                break; // backpressure — drop this chunk rather than stall capture
            }
        }
        if buf.len() > max_buffered {
            buf.clear();
        }
    });
    audio::set_sink(Some(sink));

    if let Ok(mut slot) = session_slot().lock() {
        *slot = Some(Session { id: id.clone(), tx });
    }

    // Reader task: turn transcript events into frontend updates.
    let task_id = id.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            match output.transcript_result_stream.recv().await {
                Ok(Some(TranscriptResultStream::TranscriptEvent(event))) => {
                    let Some(transcript) = event.transcript() else {
                        continue;
                    };
                    for result in transcript.results() {
                        let items = result
                            .alternatives()
                            .first()
                            .map(|a| a.items())
                            .unwrap_or(&[]);
                        let segments = segments_from_items(items);
                        if segments.is_empty() {
                            continue;
                        }
                        let payload = TranscriptUpdate {
                            kind: if result.is_partial() { "partial" } else { "final" },
                            segments,
                            message: None,
                        };
                        let _ = app_handle.emit("transcribe:update", payload);
                    }
                }
                Ok(Some(_)) => {}
                Ok(None) => {
                    let _ = app_handle.emit(
                        "transcribe:update",
                        TranscriptUpdate {
                            kind: "ended",
                            segments: Vec::new(),
                            message: None,
                        },
                    );
                    break;
                }
                Err(err) => {
                    let _ = app_handle.emit(
                        "transcribe:update",
                        TranscriptUpdate {
                            kind: "error",
                            segments: Vec::new(),
                            message: Some(format!("Transcribe stopped: {err}")),
                        },
                    );
                    break;
                }
            }
        }
        release_session(&task_id);
    });

    Ok(id)
}

/// Stops the session. Dropping the sender closes the audio event stream, which
/// makes Transcribe flush its final results and close the connection.
pub fn stop() -> Result<(), String> {
    let taken = session_slot()
        .lock()
        .map_err(|_| "transcription state is poisoned".to_string())?
        .take();
    audio::set_sink(None);
    drop(taken);
    Ok(())
}

/// Clears session state only if `id` is still the active session, so a reader
/// task shutting down late can't clobber a session started in the meantime.
fn release_session(id: &str) {
    let Ok(mut slot) = session_slot().lock() else {
        return;
    };
    let is_current = slot.as_ref().map(|s| s.id == id).unwrap_or(false);
    if is_current {
        slot.take();
        drop(slot);
        audio::set_sink(None);
    }
}

/// Groups Transcribe items into speaker turns. Punctuation items are appended
/// to the previous word; pronunciation items are space-separated.
fn segments_from_items(items: &[Item]) -> Vec<Segment> {
    let mut out: Vec<Segment> = Vec::new();
    for item in items {
        let Some(content) = item.content() else {
            continue;
        };
        if content.is_empty() {
            continue;
        }
        let is_punctuation = matches!(item.r#type(), Some(ItemType::Punctuation));
        let speaker = item.speaker().unwrap_or("unknown").to_string();
        let start_ms = (item.start_time() * 1000.0) as u64;
        let end_ms = (item.end_time() * 1000.0) as u64;

        match out.last_mut() {
            Some(last) if last.speaker == speaker => {
                if is_punctuation {
                    last.text.push_str(content);
                } else {
                    if !last.text.is_empty() {
                        last.text.push(' ');
                    }
                    last.text.push_str(content);
                }
                last.end_ms = end_ms;
            }
            _ => out.push(Segment {
                speaker,
                text: content.trim_start().to_string(),
                start_ms,
                end_ms,
            }),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn word(content: &str, speaker: &str, start: f64, end: f64) -> Item {
        Item::builder()
            .content(content)
            .r#type(ItemType::Pronunciation)
            .speaker(speaker)
            .start_time(start)
            .end_time(end)
            .build()
    }

    fn punctuation(content: &str, speaker: &str) -> Item {
        Item::builder()
            .content(content)
            .r#type(ItemType::Punctuation)
            .speaker(speaker)
            .build()
    }

    #[test]
    fn a_speakers_words_join_into_one_segment() {
        let segments = segments_from_items(&[
            word("Hello", "spk_0", 1.0, 1.5),
            word("there", "spk_0", 1.5, 2.25),
        ]);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].speaker, "spk_0");
        assert_eq!(segments[0].text, "Hello there");
        assert_eq!(segments[0].start_ms, 1000);
        assert_eq!(segments[0].end_ms, 2250);
    }

    #[test]
    fn punctuation_attaches_without_a_space() {
        let segments = segments_from_items(&[
            word("Hello", "spk_0", 0.0, 1.0),
            punctuation(",", "spk_0"),
            word("there", "spk_0", 1.0, 2.0),
            punctuation(".", "spk_0"),
        ]);
        assert_eq!(segments[0].text, "Hello, there.");
    }

    #[test]
    fn a_new_speaker_starts_a_new_segment() {
        let segments = segments_from_items(&[
            word("Hi", "spk_0", 0.0, 1.0),
            word("Hello", "spk_1", 1.0, 2.0),
            word("Bye", "spk_0", 2.0, 3.0),
        ]);
        let turns: Vec<_> = segments.iter().map(|s| (s.speaker.as_str(), s.text.as_str())).collect();
        assert_eq!(turns, [("spk_0", "Hi"), ("spk_1", "Hello"), ("spk_0", "Bye")]);
    }

    #[test]
    fn a_word_with_no_speaker_is_labelled_unknown() {
        let item = Item::builder().content("Hi").r#type(ItemType::Pronunciation).build();
        assert_eq!(segments_from_items(&[item])[0].speaker, "unknown");
    }

    #[test]
    fn empty_items_are_skipped() {
        let no_content = Item::builder().r#type(ItemType::Pronunciation).speaker("spk_0").build();
        assert!(segments_from_items(&[no_content, word("", "spk_0", 0.0, 1.0)]).is_empty());
    }

    #[test]
    fn updates_serialize_with_the_names_the_webview_expects() {
        let update = TranscriptUpdate {
            kind: "final",
            segments: vec![Segment { speaker: "spk_0".into(), text: "Hi".into(), start_ms: 1, end_ms: 2 }],
            message: None,
        };
        assert_eq!(
            serde_json::to_value(update).unwrap(),
            serde_json::json!({
                "kind": "final",
                "segments": [{ "speaker": "spk_0", "text": "Hi", "startMs": 1, "endMs": 2 }],
                "message": null,
            })
        );
    }
}
