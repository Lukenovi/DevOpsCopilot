"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Bot, User, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { Message } from "@/lib/api";
import { clsx } from "clsx";

interface Props {
  message: Message;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={clsx(
        "group flex items-start gap-3 py-4",
        isUser && "flex-row-reverse"
      )}
    >
      {/* Avatar */}
      <div
        className={clsx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-gray-600" : "bg-brand"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={clsx(
          "relative max-w-[80%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "rounded-tr-sm bg-brand text-white"
            : "rounded-tl-sm border border-surface-border bg-surface-raised text-gray-100"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeString = String(children).replace(/\n$/, "");
                  return match ? (
                    <CodeBlock lang={match[1]} code={codeString} />
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 overflow-hidden rounded-lg border border-surface-border">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[#1e2030] px-4 py-2">
        <span className="text-xs font-medium text-gray-400">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs text-gray-400 transition hover:text-gray-100"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={lang}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.8rem" }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
