"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-surface-border bg-surface-raised px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask anything DevOps… (Shift+Enter for new line)"
          rows={1}
          disabled={disabled}
          className={clsx(
            "flex-1 resize-none rounded-xl border border-surface-border bg-surface px-4 py-3",
            "text-sm text-gray-100 placeholder:text-gray-500",
            "focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand",
            "disabled:opacity-50",
            "max-h-[200px] overflow-y-auto"
          )}
        />
        <button
          onClick={submit}
          disabled={!value.trim() || disabled}
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
            "bg-brand text-white hover:bg-brand-hover",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-gray-600">
        DevOps Copilot can make mistakes. Verify critical commands before
        running in production.
      </p>
    </div>
  );
}
