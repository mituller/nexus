//! Microphone capture, WAV persistence and a pluggable PCM sink.
//!
//! `cpal::Stream` is not `Send` on macOS, so the stream lives on one dedicated
//! thread and every command round-trips through a channel. Captured audio is
//! handed to a writer thread over a bounded channel, so a long meeting never
//! accumulates in memory and the CoreAudio callback never touches the disk.

use std::fs::File;
use std::io::{Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, SyncSender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{SystemTime, UNIX_EPOCH};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use serde::Serialize;

/// Sample rates Amazon Transcribe streaming accepts. If the device's default
/// rate is outside this set we re-open the mic at 16 kHz instead.
const TRANSCRIBE_RATES: [u32; 6] = [8000, 16000, 22050, 24000, 44100, 48000];

/// Receives mono 16-bit PCM straight from the capture callback. Must not block
/// — it runs on the CoreAudio thread.
pub type PcmSink = Arc<dyn Fn(&[i16]) + Send + Sync + 'static>;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingInfo {
    pub sample_rate: u32,
    pub channels: u16,
    pub format: String,
}

struct Shared {
    /// Optional live consumer (the Transcribe session).
    sink: Mutex<Option<PcmSink>>,
    /// Peak amplitude of the most recent callback, as `f32::to_bits`.
    level: AtomicU32,
    recording: AtomicBool,
}

/// Owns the audio file writer for one recording.
struct Recording {
    info: RecordingInfo,
    path: PathBuf,
    tx: SyncSender<Vec<i16>>,
    writer: JoinHandle<Result<(), String>>,
}

enum Cmd {
    Start {
        dir: PathBuf,
        respond: Sender<Result<RecordingInfo, String>>,
    },
    Stop {
        respond: Sender<Result<String, String>>,
    },
}

static SHARED: OnceLock<Arc<Shared>> = OnceLock::new();
static CMD_TX: OnceLock<Sender<Cmd>> = OnceLock::new();

fn shared() -> Arc<Shared> {
    SHARED
        .get_or_init(|| {
            Arc::new(Shared {
                sink: Mutex::new(None),
                level: AtomicU32::new(0),
                recording: AtomicBool::new(false),
            })
        })
        .clone()
}

fn cmd_tx() -> Sender<Cmd> {
    CMD_TX
        .get_or_init(|| {
            let (tx, rx) = mpsc::channel::<Cmd>();
            let shared = shared();
            std::thread::Builder::new()
                .name("nexus-audio".into())
                .spawn(move || audio_thread(rx, shared))
                .expect("failed to spawn audio thread");
            tx
        })
        .clone()
}

// ─── Public API ──────────────────────────────────────────────────────────────

pub fn start(dir: PathBuf) -> Result<RecordingInfo, String> {
    let (respond_tx, respond_rx) = mpsc::channel();
    cmd_tx()
        .send(Cmd::Start {
            dir,
            respond: respond_tx,
        })
        .map_err(|_| "audio thread is not running".to_string())?;
    respond_rx
        .recv()
        .map_err(|_| "audio thread dropped the request".to_string())?
}

/// Stops the mic, finishes the WAV file and returns its path.
pub fn stop() -> Result<String, String> {
    let (respond_tx, respond_rx) = mpsc::channel();
    cmd_tx()
        .send(Cmd::Stop {
            respond: respond_tx,
        })
        .map_err(|_| "audio thread is not running".to_string())?;
    respond_rx
        .recv()
        .map_err(|_| "audio thread dropped the request".to_string())?
}

pub fn level() -> f32 {
    f32::from_bits(shared().level.load(Ordering::Relaxed))
}

pub fn is_recording() -> bool {
    shared().recording.load(Ordering::Relaxed)
}

/// Installs (or clears) the live PCM consumer. Used by the Transcribe session.
pub fn set_sink(sink: Option<PcmSink>) {
    let shared = shared();
    *shared.sink.lock().expect("sink mutex poisoned") = sink;
}

// ─── Recorder thread ─────────────────────────────────────────────────────────

fn audio_thread(rx: Receiver<Cmd>, shared: Arc<Shared>) {
    // Both are kept alive until Stop; dropping the stream ends capture.
    let mut stream: Option<cpal::Stream> = None;
    let mut recording: Option<Recording> = None;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            Cmd::Start {
                dir: target_dir,
                respond,
            } => {
                if stream.is_some() {
                    let _ = respond.send(Err("Already recording".into()));
                    continue;
                }
                match begin(&shared, target_dir) {
                    Ok((new_stream, new_recording)) => {
                        if let Err(e) = new_stream.play() {
                            let _ = respond.send(Err(format!("Failed to start microphone: {e}")));
                            continue;
                        }
                        shared.recording.store(true, Ordering::Relaxed);
                        shared.level.store(0, Ordering::Relaxed);
                        stream = Some(new_stream);
                        let info = new_recording.info.clone();
                        recording = Some(new_recording);
                        let _ = respond.send(Ok(info));
                    }
                    Err(e) => {
                        let _ = respond.send(Err(e));
                    }
                }
            }
            Cmd::Stop { respond } => {
                let loaded = stream.is_some();
                stream = None; // drop → capture stops feeding the writer
                shared.recording.store(false, Ordering::Relaxed);
                shared.sink.lock().expect("sink mutex").take();

                let result = match recording.take() {
                    Some(rec) => finish(rec),
                    None if loaded => Err("Recording metadata was lost".into()),
                    None => Err("Not recording".into()),
                };
                let _ = respond.send(result);
            }
        }
    }
}

/// Builds the capture stream plus its backing writer thread.
fn begin(shared: &Arc<Shared>, dir: PathBuf) -> Result<(cpal::Stream, Recording), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone found".to_string())?;

    let default = device
        .default_input_config()
        .map_err(|e| format!("No usable microphone input config: {e}"))?;

    // Prefer the device default, but Transcribe only accepts a fixed set of
    // sample rates — fall back to 16 kHz when the default is exotic.
    let (config, channels, sample_format): (StreamConfig, u16, SampleFormat) =
        if TRANSCRIBE_RATES.contains(&default.sample_rate()) {
            (default.config(), default.channels(), default.sample_format())
        } else {
            match pick_rate(&device, 16000) {
                Some(c) => (c.config(), c.channels(), c.sample_format()),
                None => (default.config(), default.channels(), default.sample_format()),
            }
        };
    let sample_rate = config.sample_rate;
    let format = format!("{sample_format:?}");

    // ~10 s of backlog at 48 kHz mono before we start dropping frames.
    let (writer_tx, writer_rx) = mpsc::sync_channel::<Vec<i16>>(512);
    let path = recording_path(&dir)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create recordings folder: {e}"))?;
    let writer_path = path.clone();
    let writer = std::thread::Builder::new()
        .name("nexus-audio-writer".into())
        .spawn(move || write_audio(writer_rx, writer_path, sample_rate))
        .map_err(|e| format!("Could not start the audio writer: {e}"))?;

    let data_shared = shared.clone();
    let err_shared = shared.clone();
    let sink_tx = writer_tx.clone();
    let stream = device
        .build_input_stream_raw(
            config,
            sample_format,
            move |data, _| capture(data, channels, &data_shared, &sink_tx),
            move |err| {
                eprintln!("[audio] stream error: {err}");
                err_shared.recording.store(false, Ordering::Relaxed);
            },
            None,
        )
        .map_err(|e| format!("Failed to open microphone: {e}"))?;

    Ok((
        stream,
        Recording {
            info: RecordingInfo {
                sample_rate,
                channels,
                format,
            },
            path,
            tx: writer_tx,
            writer,
        },
    ))
}

/// Closes the writer channel and waits for the WAV file to be finalized.
fn finish(rec: Recording) -> Result<String, String> {
    let Recording {
        path,
        tx,
        writer,
        info: _,
    } = rec;
    drop(tx); // ends the writer loop
    writer
        .join()
        .map_err(|_| "The audio writer thread panicked".to_string())??;
    Ok(path.to_string_lossy().to_string())
}

/// CoreAudio callback thread. Keep this allocation-light and non-blocking.
fn capture(data: &cpal::Data, channels: u16, shared: &Arc<Shared>, writer: &SyncSender<Vec<i16>>) {
    let mono = to_mono_i16(data, channels);
    if mono.is_empty() {
        return;
    }

    let peak = mono
        .iter()
        .map(|s| (*s as i32).abs())
        .max()
        .unwrap_or(0) as f32
        / 32768.0;
    shared.level.store(peak.to_bits(), Ordering::Relaxed);

    // Hand the frame to the transcriber first (borrowed), then to the writer.
    let sink = shared.sink.lock().ok().and_then(|s| s.clone());
    if let Some(sink) = sink {
        sink(&mono);
    }

    // Drop the chunk rather than stall the audio thread if the writer falls
    // behind on disk I/O.
    let _ = writer.try_send(mono);
}

/// Converts whatever the device handed us into mono signed 16-bit PCM.
fn to_mono_i16(data: &cpal::Data, channels: u16) -> Vec<i16> {
    let interleaved: Vec<i16> = match data.sample_format() {
        SampleFormat::F32 => data
            .as_slice::<f32>()
            .map(|s| s.iter().map(|v| f32_to_i16(*v)).collect())
            .unwrap_or_default(),
        SampleFormat::F64 => data
            .as_slice::<f64>()
            .map(|s| s.iter().map(|v| f32_to_i16(*v as f32)).collect())
            .unwrap_or_default(),
        SampleFormat::I16 => data.as_slice::<i16>().map(<[i16]>::to_vec).unwrap_or_default(),
        SampleFormat::U16 => data
            .as_slice::<u16>()
            .map(|s| s.iter().map(|v| v.wrapping_sub(32768) as i16).collect())
            .unwrap_or_default(),
        SampleFormat::I32 => data
            .as_slice::<i32>()
            .map(|s| s.iter().map(|v| (v >> 16) as i16).collect())
            .unwrap_or_default(),
        SampleFormat::U32 => data
            .as_slice::<u32>()
            .map(|s| s.iter().map(|v| ((v >> 16) as i32 - 32768) as i16).collect())
            .unwrap_or_default(),
        other => {
            eprintln!("[audio] unsupported sample format {other:?}");
            return Vec::new();
        }
    };

    // Downmix to mono so Transcribe gets a single channel.
    let channels = channels.max(1) as usize;
    if channels <= 1 {
        return interleaved;
    }
    interleaved
        .chunks(channels)
        .map(|frame| {
            let sum: i32 = frame.iter().map(|s| *s as i32).sum();
            (sum / frame.len() as i32) as i16
        })
        .collect()
}

fn pick_rate(device: &cpal::Device, rate: u32) -> Option<cpal::SupportedStreamConfig> {
    device
        .supported_input_configs()
        .ok()?
        .find(|r| r.min_sample_rate() <= rate && r.max_sample_rate() >= rate)
        .map(|r| r.with_sample_rate(rate))
}

fn f32_to_i16(v: f32) -> i16 {
    (v.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

// ─── WAV writer ──────────────────────────────────────────────────────────────

fn recording_path(dir: &PathBuf) -> Result<PathBuf, String> {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok(dir.join(format!("recording-{secs}.wav")))
}

/// Streams PCM chunks to a 16-bit mono WAV, patching the RIFF sizes at the end
/// so nothing has to be buffered in memory.
fn write_audio(rx: Receiver<Vec<i16>>, path: PathBuf, sample_rate: u32) -> Result<(), String> {
    let mut file = File::create(&path).map_err(|e| format!("Could not write WAV: {e}"))?;
    file.write_all(&wav_header(0, sample_rate))
        .map_err(|e| e.to_string())?;

    let mut data_len: u32 = 0;
    while let Ok(chunk) = rx.recv() {
        let mut bytes = Vec::with_capacity(chunk.len() * 2);
        for sample in chunk {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        file.write_all(&bytes)
            .map_err(|e| format!("Could not write audio: {e}"))?;
        data_len = data_len.saturating_add(bytes.len() as u32);
    }

    if data_len == 0 {
        drop(file);
        let _ = std::fs::remove_file(&path);
        return Err("No audio was captured".into());
    }

    // Patch the two size fields now that the length is known.
    file.seek(SeekFrom::Start(4)).map_err(|e| e.to_string())?;
    file.write_all(&(36 + data_len).to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(40)).map_err(|e| e.to_string())?;
    file.write_all(&data_len.to_le_bytes())
        .map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn wav_header(data_len: u32, sample_rate: u32) -> Vec<u8> {
    let mut header = Vec::with_capacity(44);
    header.extend_from_slice(b"RIFF");
    header.extend_from_slice(&(36 + data_len).to_le_bytes());
    header.extend_from_slice(b"WAVEfmt ");
    header.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    header.extend_from_slice(&1u16.to_le_bytes()); // PCM
    header.extend_from_slice(&1u16.to_le_bytes()); // mono
    header.extend_from_slice(&sample_rate.to_le_bytes());
    header.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // byte rate
    header.extend_from_slice(&2u16.to_le_bytes()); // block align
    header.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    header.extend_from_slice(b"data");
    header.extend_from_slice(&data_len.to_le_bytes());
    header
}
