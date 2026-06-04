"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Send, Wrench, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RenderPart = {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
};

const SUGGESTIONS = [
  "Find nail salons in Miami",
  "Enrich the businesses I added today",
  "Show me contacts I haven't emailed yet",
];

export default function AgentPage() {
  // Fresh conversation per page load; long-term memory comes from recall.
  const [conversationId] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : "new",
  );
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent",
      body: { conversationId },
    }),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Bot className="h-6 w-6 text-primary" />
          Scalar
        </h1>
        <p className="text-muted-foreground mt-1">
          Your agent with hands — it searches the web, enriches records, and
          writes straight into your CRM.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="mt-6 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-background/40 p-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Bot className="h-10 w-10 text-primary" />
            <p className="text-muted-foreground max-w-sm">
              Tell Scalar what you need. Try one of these:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const parts = (m.parts ?? []) as unknown as RenderPart[];
          return (
            <div key={m.id} className="flex gap-3">
              <div className="mt-0.5 shrink-0">
                {m.role === "user" ? (
                  <User className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Bot className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                        {part.text}
                      </p>
                    );
                  }
                  if (
                    part.type.startsWith("tool-") ||
                    part.type === "dynamic-tool"
                  ) {
                    const name =
                      part.toolName ??
                      (part.type.startsWith("tool-")
                        ? part.type.slice(5)
                        : "tool");
                    const done = part.state === "output-available";
                    return (
                      <div
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
                      >
                        <Wrench className="h-3 w-3" />
                        <span className="font-medium">{name}</span>
                        <span>{done ? "done" : "working…"}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4 animate-pulse text-primary" /> thinking…
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error.message ||
              "Something went wrong. Is OPENAI_API_KEY set on the deployment?"}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="mt-4 flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Scalar to find, enrich, or update…"
          disabled={busy}
        />
        <Button type="submit" variant="glow" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
