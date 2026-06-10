"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { SendHorizontal, Square } from "lucide-react";

type ChatComposerProps = {
  disabled?: boolean;
  pending?: boolean;
  placeholder: string;
  onStop?: () => void;
  onSubmit: (message: string) => void;
};

export function ChatComposer({ disabled = false, pending = false, placeholder, onStop, onSubmit }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const inputDisabled = disabled || pending;

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || inputDisabled) return;
    setValue("");
    onSubmit(trimmed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
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
