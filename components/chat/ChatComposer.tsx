"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Mic, SendHorizontal, Square } from "lucide-react";
import {
  composeSpeechValue,
  getSpeechRecognitionConstructor,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEventLike,
} from "@/lib/speech/pushToTalk";

type ChatComposerProps = {
  disabled?: boolean;
  pending?: boolean;
  placeholder: string;
  onStop?: () => void;
  onSubmit: (message: string) => void;
};

export function ChatComposer({ disabled = false, pending = false, placeholder, onStop, onSubmit }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechBaseValueRef = useRef("");
  const inputDisabled = disabled || pending;
  const speechDisabled = inputDisabled || !speechAvailable;

  useEffect(() => {
    setSpeechAvailable(typeof window !== "undefined" && Boolean(getSpeechRecognitionConstructor(window)));

    return () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.abort();
    };
  }, []);

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || inputDisabled) return;
    stopSpeechInput();
    setValue("");
    onSubmit(trimmed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function updateValueFromSpeech(event: SpeechRecognitionResultEventLike) {
    let transcript = "";
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index]?.[0]?.transcript ?? "";
    }
    setValue(composeSpeechValue(speechBaseValueRef.current, transcript));
  }

  function stopSpeechInput() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setListening(false);
      return;
    }

    try {
      recognition.stop();
    } catch {
      recognition.abort();
      recognitionRef.current = null;
      setListening(false);
    }
  }

  function startSpeechInput() {
    if (speechDisabled || recognitionRef.current) return;

    const SpeechRecognition = typeof window === "undefined" ? null : getSpeechRecognitionConstructor(window);
    if (!SpeechRecognition) {
      setSpeechAvailable(false);
      setSpeechError("Speech input unavailable");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US";
    recognition.onresult = updateValueFromSpeech;
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setSpeechAvailable(false);
        setSpeechError("Microphone access unavailable");
      } else {
        setSpeechError("Speech input paused");
      }
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    speechBaseValueRef.current = value;
    recognitionRef.current = recognition;
    setSpeechError(null);
    setListening(true);

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setSpeechError("Speech input unavailable");
    }
  }

  function onSpeechKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!event.repeat) startSpeechInput();
  }

  function onSpeechKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    stopSpeechInput();
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        value={value}
        disabled={inputDisabled}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
      />
      <button
        className={`icon-button push-to-talk-button${listening ? " is-listening" : ""}`}
        type="button"
        disabled={speechDisabled}
        aria-label={listening ? "Stop dictation" : "Hold to dictate message"}
        aria-pressed={listening}
        title={speechError ?? (speechAvailable ? "Hold to dictate" : "Speech input unavailable")}
        onPointerDown={(event) => {
          event.preventDefault();
          startSpeechInput();
        }}
        onPointerUp={stopSpeechInput}
        onPointerCancel={stopSpeechInput}
        onPointerLeave={stopSpeechInput}
        onKeyDown={onSpeechKeyDown}
        onKeyUp={onSpeechKeyUp}
      >
        <Mic size={17} />
      </button>
      {pending ? (
        <button className="icon-button stop-button" type="button" onClick={onStop} aria-label="Stop response">
          <Square size={16} />
        </button>
      ) : (
        <button className="icon-button send-button" type="submit" disabled={disabled || !value.trim()} aria-label="Send message">
          <SendHorizontal size={18} />
        </button>
      )}
    </form>
  );
}
