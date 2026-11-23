interface LocalSpeechResult {
  isFinal: boolean;
  0: { transcript: string };
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

export function startOnDeviceDictation(
  onText: (text: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
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
  recognition.interimResults = false;
  recognition.lang = navigator.language || "en-US";
  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result?.isFinal) {
        const transcript = result[0]?.transcript.trim();
        if (transcript) onText(transcript);
      }
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
