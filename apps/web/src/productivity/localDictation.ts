interface LocalSpeechResult {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string; confidence?: number };
}

interface LocalSpeechEvent extends Event {
  resultIndex: number;
  results: ArrayLike<LocalSpeechResult>;
}

interface LocalSpeechErrorEvent extends Event {
  error?: string;
}

interface LocalSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  contextualStrings?: string[];
  processLocally?: boolean;
  onresult: ((event: LocalSpeechEvent) => void) | null;
  onerror: ((event: LocalSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface LocalSpeechRecognitionConstructor {
  new (): LocalSpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: LocalSpeechRecognitionConstructor;
    webkitSpeechRecognition?: LocalSpeechRecognitionConstructor;
  }
}

export function appendDictationText(current: string, transcript: string) {
  const next = transcript.trim();
  if (!next) return current;
  const existing = current.trimEnd();
  if (!existing) return next;
  const separator = /\s$/.test(current) || /^[,.;:!?)]/.test(next) ? "" : " ";
  return `${existing}${separator}${next}`;
}

export function startOnDeviceDictation(
  onText: (text: string) => void,
  onInterim: (text: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
  contextualStrings: string[] = [],
): () => void {
  const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Constructor) {
    throw new Error("On-device dictation is not supported in this browser.");
  }

  const recognition = new Constructor();
  if (!("processLocally" in recognition)) {
    throw new Error("This browser cannot guarantee on-device speech recognition.");
  }

  recognition.processLocally = true;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  recognition.lang = navigator.languages?.find((language) => language.toLowerCase().startsWith("en-")) ?? navigator.language ?? "en-US";
  if ("contextualStrings" in recognition) {
    recognition.contextualStrings = contextualStrings.slice(0, 100);
  }
  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result?.length) continue;
      const candidates = Array.from({ length: result.length }, (_, alternativeIndex) => result[alternativeIndex])
        .filter((candidate): candidate is { transcript: string; confidence?: number } => Boolean(candidate?.transcript.trim()));
      const best = candidates.reduce((current, candidate) =>
        (candidate.confidence ?? -1) > (current.confidence ?? -1) ? candidate : current, candidates[0]);
      if (!best) continue;
      if (result.isFinal) onText(best.transcript.trim());
      else onInterim(best.transcript.trim());
    }
  };
  recognition.onerror = (event) => {
    const message = event.error === "not-allowed"
      ? "Microphone access was denied. Allow microphone access to dictate."
      : event.error === "language-not-supported"
        ? "The on-device speech model for this language is not installed."
        : "On-device dictation stopped. Check microphone access and the downloaded speech model.";
    onError(message);
  };
  recognition.onend = onEnd;
  recognition.start();
  return () => recognition.stop();
}
