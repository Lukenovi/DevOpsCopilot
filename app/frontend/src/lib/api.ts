const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatResponse {
  session_id: string;
  message: Message;
  token_count?: number;
}

export async function sendChatMessage(
  userMessage: string,
  sessionId?: string | null
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: userMessage,
      session_id: sessionId ?? undefined,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<ChatResponse>;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/sessions/${sessionId}`, {
    method: "DELETE",
  });
}
