"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { SendHorizontal } from "lucide-react";

type ChatComposerProps = {
  disabled?: boolean;
  placeholder: string;
  onSubmit: (message: string) => void;
};

export function ChatComposer({ disabled = false, placeholder, onSubmit }: ChatComposerProps) {
  const [value, setValue] = useState("");

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
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
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
      />
      <button className="icon-button send-button" type="submit" disabled={disabled || !value.trim()} aria-label="Send message">
        <SendHorizontal size={18} />
      </button>
    </form>
  );
}
