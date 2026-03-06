"use client";

import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { sendChatMessage, deleteSession, type Message } from "@/lib/api";

export interface MessageWithSources extends Message {
  sources?: string[];
}

export function useChat() {
  const [messages, setMessages] = useState<MessageWithSources[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: MessageWithSources = {
      id: uuidv4(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendChatMessage(text, sessionIdRef.current);
      sessionIdRef.current = response.session_id;
      const assistantMsg: MessageWithSources = {
        ...response.message,
        sources: response.sources,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearSession = useCallback(async () => {
    if (sessionIdRef.current) {
      await deleteSession(sessionIdRef.current).catch(() => undefined);
      sessionIdRef.current = null;
    }
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sessionId: sessionIdRef.current,
    sendMessage,
    clearSession,
  };
}
