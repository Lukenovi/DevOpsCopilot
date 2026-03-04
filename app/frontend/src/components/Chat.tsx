"use client";

import { useEffect, useRef } from "react";
import { Bot, Trash2 } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

export default function Chat() {
  const { messages, isLoading, error, sessionId, sendMessage, clearSession } =
    useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-surface-border bg-surface-raised px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-brand" />
          <span className="font-semibold text-gray-100">DevOps Copilot</span>
          <span className="rounded bg-brand-muted px-1.5 py-0.5 text-xs text-brand-hover">
            Powered by Gemini
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearSession}
            title="Clear conversation"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition hover:bg-surface-border hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </header>

      {/* ── Messages ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && !isLoading && (
          <WelcomeScreen onExample={sendMessage} />
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex items-start gap-3 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex items-center gap-1 pt-2">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="my-2 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ──────────────────────────────────────────── */}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}

function WelcomeScreen({ onExample }: { onExample: (msg: string) => void }) {
  const examples = [
    "How do I set up a blue-green deployment on Cloud Run with zero downtime?",
    "Write a GitHub Actions workflow to build and push a Docker image to Artifact Registry.",
    "What's the best practice for managing Terraform state with multiple team members?",
    "Explain Kubernetes liveness vs readiness probes with examples.",
  ];

  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="mb-6 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand">
          <Bot className="h-9 w-9 text-white" />
        </div>
      </div>
      <h1 className="mb-2 text-2xl font-bold text-gray-100">
        DevOps Copilot
      </h1>
      <p className="mb-8 text-gray-400">
        Your AI assistant for CI/CD, Kubernetes, Terraform, GCP, and
        everything DevOps.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => onExample(ex)}
            className="rounded-xl border border-surface-border bg-surface-raised p-3 text-left text-sm text-gray-300 transition hover:border-brand hover:text-gray-100"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
