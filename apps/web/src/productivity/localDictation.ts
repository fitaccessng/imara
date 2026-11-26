import type {
  AutomaticSpeechRecognitionPipeline,
  ProgressInfo,
} from "@huggingface/transformers";

const MODEL_ID = "onnx-community/whisper-tiny";
const SAMPLE_RATE = 16_000;
const SEGMENT_SECONDS = 6;
const OVERLAP_SECONDS = 0.6;
const MINIMUM_FINAL_SECONDS = 1;

export interface DictationSession {
  stop: () => void;
  cancel: () => void;
}

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

export function appendDictationText(current: string, transcript: string) {
  const existing = current.trimEnd();
  const incoming = transcript.trim();
  if (!incoming) return current;
  if (!existing) return incoming;

  const previousWords = existing.split(/\s+/);
  const nextWords = incoming.split(/\s+/);
  const normalize = (word: string) => word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const maxOverlap = Math.min(8, previousWords.length, nextWords.length);
  let overlap = 0;
  for (let count = maxOverlap; count > 0; count -= 1) {
    const previous = previousWords.slice(-count).map(normalize);
    const next = nextWords.slice(0, count).map(normalize);
    if (previous.every((word, index) => word && word === next[index])) {
      overlap = count;
      break;
    }
  }
  const remainder = nextWords.slice(overlap).join(" ");
  if (!remainder) return current;
  const separator = /\s$/.test(current) || /^[,.;:!?)]/.test(remainder) ? "" : " ";
  return `${existing}${separator}${remainder}`;
}

function createTranscriber(onStatus: (status: string) => void) {
  return import("@huggingface/transformers").then(async ({ env, pipeline }) => {
    if (typeof caches === "undefined") {
      throw new Error("This browser cannot keep a local model cache. Use a standard browser tab instead of private browsing.");
    }
    env.useBrowserCache = true;
    env.cacheKey = "imara-speech-model-cache-v1";
    try {
      await caches.open(env.cacheKey);
    } catch {
      throw new Error(
        "This browser could not open the persistent model cache. Try a standard browser tab instead of private browsing."
      );
    }
    return pipeline("automatic-speech-recognition", MODEL_ID, {
      progress_callback: (progress: ProgressInfo) => {
        if (progress.status === "progress_total") {
          onStatus(`Loading local speech model · ${Math.round(progress.progress)}%`);
        } else if (progress.status === "ready") {
          onStatus("Warming up local speech model…");
        }
      },
    });
  });
}

function getTranscriber(onStatus: (status: string) => void) {
  if (!transcriberPromise) {
    transcriberPromise = createTranscriber(onStatus).catch((error: unknown) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

function toUserMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was denied. Allow microphone access to dictate.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found. Connect a microphone and try again.";
  }
  if (error instanceof Error && /fetch|network|download/i.test(error.message)) {
    return "The local speech model could not be downloaded. Check your connection and try again.";
  }
  if (error instanceof Error) return error.message;
  return "Local dictation could not be completed.";
}

async function resampleAudio(samples: Float32Array, sourceRate: number) {
  if (sourceRate === SAMPLE_RATE) return samples;
  const targetLength = Math.ceil((samples.length * SAMPLE_RATE) / sourceRate);
  const offline = new OfflineAudioContext(1, targetLength, SAMPLE_RATE);
  const buffer = offline.createBuffer(1, samples.length, sourceRate);
  buffer.copyToChannel(samples, 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const converted = await offline.startRendering();
  return converted.getChannelData(0);
}

function joinSamples(first: Float32Array, second: Float32Array) {
  const joined = new Float32Array(first.length + second.length);
  joined.set(first);
  joined.set(second, first.length);
  return joined;
}

function popSamples(
  buffers: Float32Array[],
  sampleOffset: { value: number },
  count: number
) {
  const result = new Float32Array(count);
  let written = 0;
  while (written < count) {
    const current = buffers[0];
    if (!current) break;
    const available = current.length - sampleOffset.value;
    const take = Math.min(available, count - written);
    result.set(current.subarray(sampleOffset.value, sampleOffset.value + take), written);
    written += take;
    sampleOffset.value += take;
    if (sampleOffset.value === current.length) {
      buffers.shift();
      sampleOffset.value = 0;
    }
  }
  return written === count ? result : result.slice(0, written);
}

export async function startLocalModelDictation(
  onText: (text: string) => void,
  onStatus: (status: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
  signal: AbortSignal,
): Promise<DictationSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Audio recording is not supported in this browser.");
  }
  if (
    typeof AudioContext === "undefined" ||
    typeof OfflineAudioContext === "undefined"
  ) {
    throw new Error("Audio processing is not supported in this browser.");
  }

  onStatus("Loading the local model. First use downloads it; future uses load the cached copy.");
  const transcriber = await getTranscriber((status) => {
    if (!signal.aborted) onStatus(status);
  });
  if (signal.aborted) throw new DOMException("Dictation cancelled.", "AbortError");

  onStatus("Waiting for microphone permission…");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  if (signal.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw new DOMException("Dictation cancelled.", "AbortError");
  }

  const releaseMicrophone = () => stream.getTracks().forEach((track) => track.stop());
  let context: AudioContext;
  try {
    try {
      context = new AudioContext({ sampleRate: SAMPLE_RATE });
    } catch {
      context = new AudioContext();
    }
  } catch (error) {
    releaseMicrophone();
    throw error;
  }
  let source: MediaStreamAudioSourceNode;
  let processor: ScriptProcessorNode;
  let silence: GainNode;
  try {
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4096, 1, 1);
    silence = context.createGain();
    silence.gain.value = 0;
    source.connect(processor);
    processor.connect(silence);
    silence.connect(context.destination);
  } catch (error) {
    releaseMicrophone();
    if (context.state !== "closed") void context.close();
    throw error;
  }

  const inputBuffers: Float32Array[] = [];
  const sampleOffset = { value: 0 };
  const segmentSamples = Math.round(context.sampleRate * SEGMENT_SECONDS);
  const overlapSamples = Math.round(context.sampleRate * OVERLAP_SECONDS);
  const minimumFinalSamples = Math.round(context.sampleRate * MINIMUM_FINAL_SECONDS);
  const transcriptionQueue: Float32Array[] = [];
  let bufferedSamples = 0;
  let previousTail = new Float32Array(0);
  let transcribing = false;
  let cancelled = false;
  let stopped = false;
  let ended = false;
  let segmentCount = 0;
  let recognizedSpeech = false;

  const finishIfIdle = () => {
    if (!stopped || transcribing || transcriptionQueue.length || ended || cancelled) return;
    ended = true;
    if (!segmentCount || !recognizedSpeech) {
      onError("No speech was detected. Speak clearly into the microphone and try again.");
    }
    onStatus("");
    onEnd();
  };

  const drainTranscriptions = async () => {
    if (transcribing || cancelled) return;
    transcribing = true;
    try {
      while (transcriptionQueue.length && !cancelled) {
        const audio = transcriptionQueue.shift();
        if (!audio) continue;
        onStatus(stopped ? "Transcribing locally…" : "Listening · transcribing locally…");
        const input = await resampleAudio(audio, context.sampleRate);
        if (cancelled) return;
        const result = await transcriber(input, { sampling_rate: SAMPLE_RATE });
        if (cancelled) return;
        if (result.text.trim()) {
          recognizedSpeech = true;
          onText(result.text);
        }
      }
    } catch (error) {
      if (!cancelled) {
        onError(toUserMessage(error));
        stopped = true;
        inputBuffers.length = 0;
        bufferedSamples = 0;
        transcriptionQueue.length = 0;
        cleanupAudio();
      }
    } finally {
      transcribing = false;
      finishIfIdle();
    }
  };

  const enqueueSegment = (samples: Float32Array) => {
    const audio = joinSamples(previousTail, samples);
    previousTail = samples.slice(-overlapSamples);
    transcriptionQueue.push(audio);
    segmentCount += 1;
    void drainTranscriptions();
  };

  const capture = (event: AudioProcessingEvent) => {
    if (cancelled || stopped) return;
    const data = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(data);
    inputBuffers.push(copy);
    bufferedSamples += copy.length;
    while (bufferedSamples >= segmentSamples) {
      const segment = popSamples(inputBuffers, sampleOffset, segmentSamples);
      bufferedSamples -= segment.length;
      enqueueSegment(segment);
    }
  };

  const cleanupAudio = () => {
    processor.onaudioprocess = null;
    processor.disconnect();
    source.disconnect();
    silence.disconnect();
    releaseMicrophone();
    if (context.state !== "closed") void context.close();
  };

  processor.onaudioprocess = capture;
  try {
    await context.resume();
  } catch (error) {
    cleanupAudio();
    throw error;
  }
  onStatus("Listening. Your words are transcribed locally as you speak.");

  return {
    stop: () => {
      if (stopped || cancelled) return;
      stopped = true;
      cleanupAudio();
      if (bufferedSamples >= minimumFinalSamples) {
        enqueueSegment(popSamples(inputBuffers, sampleOffset, bufferedSamples));
        bufferedSamples = 0;
      }
      finishIfIdle();
    },
    cancel: () => {
      cancelled = true;
      stopped = true;
      inputBuffers.length = 0;
      transcriptionQueue.length = 0;
      cleanupAudio();
    },
  };
}
