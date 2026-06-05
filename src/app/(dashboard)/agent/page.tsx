"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Send, Wrench, User, Zap, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { cn } from "@/lib/utils";

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

function ToolChip({ name, done }: { name: string; done: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        done
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted/60 text-muted-foreground"
      )}
    >
      {done ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : (
        <Wrench className="h-3 w-3 shrink-0 animate-pulse" />
      )}
      <span className="font-brand tracking-wide">{name}</span>
      <span className="opacity-70">{done ? "done" : "working…"}</span>
    </span>
  );
}

function MessageBubble({
  role,
  parts,
  index,
}: {
  role: "user" | "assistant";
  parts: RenderPart[];
  index: number;
}) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: index * 0.04 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      {/* Avatar */}
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
          isUser
            ? "border-border bg-secondary text-foreground"
            : "border-primary/30 bg-primary/10 text-primary"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          "min-w-0 max-w-[80%] space-y-2",
          isUser && "items-end"
        )}
      >
        {parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  isUser
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-card border border-border text-foreground"
                )}
              >
                <p className="whitespace-pre-wrap">{part.text}</p>
              </div>
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
              <div key={i} className="flex flex-wrap gap-1.5">
                <ToolChip name={name} done={done} />
              </div>
            );
          }
          return null;
        })}
      </div>
    </motion.div>
  );
}

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
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-4">
      {/* Page header */}
      <FloatIn delay={0}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-brand flex items-center gap-2 text-2xl sm:text-3xl text-foreground">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </span>
              Scalar
            </h1>
            <p className="text-muted-foreground mt-1">
              Your agent with hands — it searches the web, enriches records, and
              writes straight into your CRM.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
            <Zap className="h-3 w-3" />
            OpenAI
          </div>
        </div>
      </FloatIn>

      {/* Chat area — spotlight-framed */}
      <FloatIn delay={0.08} className="relative flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Subtle ASCII background */}
        <AsciiField
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.025]"
          cell={14}
        />
        {/* Accent radial top-right */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgba(90,176,232,0.07) 0%, transparent 55%)",
          }}
        />

        <div
          ref={scrollRef}
          className="relative z-10 h-full space-y-4 overflow-y-auto p-5"
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-brand text-lg text-foreground">Tell Scalar what you need.</p>
                <p className="text-muted-foreground mt-1 text-sm max-w-sm">
                  It searches the web, enriches contacts, and writes straight into your CRM.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => {
            const parts = (m.parts ?? []) as unknown as RenderPart[];
            return (
              <MessageBubble
                key={m.id}
                role={m.role as "user" | "assistant"}
                parts={parts}
                index={idx}
              />
            );
          })}

          {busy && (
            <div className="flex items-center gap-2 pl-10 text-sm text-muted-foreground">
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                <Bot className="h-4 w-4 text-primary" />
              </motion.span>
              thinking&hellip;
            </div>
          )}
          {error && (
            <div className="mx-auto max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error.message ||
                "Something went wrong. Is OPENAI_API_KEY set on the deployment?"}
            </div>
          )}
        </div>
      </FloatIn>

      {/* Input */}
      <FloatIn delay={0.14}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Scalar to find, enrich, or update…"
            disabled={busy}
            className="rounded-xl"
          />
          <Button type="submit" variant="glow" disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </FloatIn>
    </div>
  );
}
