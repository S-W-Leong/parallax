export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type SpeechRecognitionHost = {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

export type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0?: {
      transcript: string;
    };
  }>;
};

export function getSpeechRecognitionConstructor(host: object | undefined): SpeechRecognitionConstructor | null {
  const speechHost = host as SpeechRecognitionHost | undefined;
  const SpeechRecognition = speechHost?.SpeechRecognition ?? speechHost?.webkitSpeechRecognition;
  return typeof SpeechRecognition === "function" ? (SpeechRecognition as SpeechRecognitionConstructor) : null;
}

export function composeSpeechValue(baseValue: string, transcript: string): string {
  const normalizedTranscript = transcript.trim().replace(/\s+/g, " ");
  if (!normalizedTranscript) return baseValue;

  const trimmedBase = baseValue.replace(/\s+$/, "");
  return trimmedBase ? `${trimmedBase} ${normalizedTranscript}` : normalizedTranscript;
}
