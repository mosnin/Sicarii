"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Send,
  Square,
  Wrench,
  CheckCircle2,
  User,
  AlertCircle,
} from "lucide-react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScalarAvatar } from "@/components/dashboard/scalar-avatar";
import { ThinkingIndicator } from "@/components/dashboard/thinking-indicator";
import { useMobileNav } from "@/components/dashboard/dashboard-shell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RenderPart = {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
};

// ---------------------------------------------------------------------------
// Suggested prompts
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  { label: "Find 10 nail salons in Miami", icon: "🔍" },
  { label: "Enrich acme.com and save it", icon: "✨" },
  { label: "Who have I contacted recently?", icon: "📋" },
  { label: "Summarize my pipeline", icon: "📊" },
] as const;

// ---------------------------------------------------------------------------
// ToolChip — an inline chip for tool-call parts
// ---------------------------------------------------------------------------

function ToolChip({ name, done }: { name: string; done: boolean }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        done
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {done ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : (
        <Wrench className="h-3 w-3 shrink-0 animate-pulse" />
      )}
      <span className="font-brand tracking-wide">{name}</span>
      <span className="opacity-70">{done ? "done" : "working…"}</span>
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// BlinkingCaret — appears at end of a streaming assistant message
// ---------------------------------------------------------------------------

function BlinkingCaret({ streaming }: { streaming: boolean }) {
  const reduce = useReducedMotion();
  if (!streaming) return null;
  return (
    <motion.span
      aria-hidden="true"
      className="ml-px inline-block h-[1em] w-0.5 translate-y-px rounded-full bg-primary align-middle"
      animate={reduce ? {} : { opacity: [1, 0, 1] }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function MessageBubble({
  role,
  parts,
  index,
  isStreaming,
}: {
  role: "user" | "assistant";
  parts: RenderPart[];
  index: number;
  isStreaming: boolean;
}) {
  const isUser = role === "user";
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? {} : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.38,
        ease: [0.16, 1, 0.3, 1],
        delay: Math.min(index * 0.04, 0.2),
      }}
      className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground shadow-sm">
          <User className="h-3.5 w-3.5" />
        </div>
      ) : (
        <ScalarAvatar />
      )}

      {/* Content */}
      <div
        className={cn(
          "min-w-0 max-w-[78%] space-y-2",
          isUser && "items-end",
        )}
      >
        {parts.map((part, i) => {
          if (part.type === "text") {
            const isLastPart = i === parts.length - 1;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  isUser
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-card text-foreground shadow-sm",
                )}
              >
                <p className="whitespace-pre-wrap break-words">
                  {part.text}
                  {!isUser && isLastPart && (
                    <BlinkingCaret streaming={isStreaming} />
                  )}
                </p>
              </div>
            );
          }
          if (
            part.type.startsWith("tool-") ||
            part.type === "dynamic-tool"
          ) {
            const name =
              part.toolName ??
              (part.type.startsWith("tool-") ? part.type.slice(5) : "tool");
            const done = part.state === "output-available";
            return (
              <div key={i} className="flex flex-wrap gap-1.5 pl-0.5">
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

// ---------------------------------------------------------------------------
// EmptyState — centered welcome when no messages yet
// ---------------------------------------------------------------------------

function EmptyState({
  onSuggestion,
}: {
  onSuggestion: (text: string) => void;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? {} : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full flex-col items-center justify-center gap-6 px-4 text-center"
    >
      {/* Logo mark */}
      <div className="relative flex h-20 w-20 items-center justify-center">
        {/* Outer glow ring */}
        <motion.div
          className="absolute inset-0 rounded-3xl bg-primary/10"
          animate={
            reduce
              ? {}
              : {
                  boxShadow: [
                    "0 0 0px 0px rgba(90,176,232,0.15)",
                    "0 0 24px 6px rgba(90,176,232,0.22)",
                    "0 0 0px 0px rgba(90,176,232,0.15)",
                  ],
                }
          }
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10"
          animate={reduce ? {} : { y: [0, -4, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="font-brand text-4xl text-primary leading-none select-none">
            S
          </span>
        </motion.div>
      </div>

      {/* Greeting */}
      <div className="space-y-2">
        <h2 className="font-brand text-2xl text-foreground tracking-tight">
          Hi, I&apos;m Scalar
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          I search the web, enrich your contacts, and write straight into your
          CRM — ask me anything.
        </p>
      </div>

      {/* Suggested prompt chips */}
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map(({ label, icon }) => (
          <motion.button
            key={label}
            onClick={() => onSuggestion(label)}
            whileHover={reduce ? {} : { scale: 1.03, y: -1 }}
            whileTap={reduce ? {} : { scale: 0.97 }}
            className="flex items-center gap-1.5 rounded-full bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-primary/8 hover:text-foreground hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GrowingTextarea — auto-growing textarea that respects a max height
// ---------------------------------------------------------------------------

function GrowingTextarea({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKey}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      className={cn(
        "w-full resize-none rounded-none bg-transparent text-sm leading-relaxed text-foreground",
        "placeholder:text-muted-foreground",
        "focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "max-h-[200px] overflow-y-auto",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Main AgentPage
// ---------------------------------------------------------------------------

export default function AgentPage() {
  // Fresh conversation per page load; long-term memory comes from recall.
  const [conversationId] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : "new",
  );
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Minimise the composer while the mobile nav panel is open so they don't
  // overlap on small screens.
  const { navOpen } = useMobileNav();

  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/agent",
      body: { conversationId },
    }),
  });

  const busy = status === "submitted" || status === "streaming";
  const isSubmitted = status === "submitted"; // before first tokens
  const isStreaming = status === "streaming"; // tokens flowing

  // Smooth-scroll to bottom whenever messages update or status changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  }

  const handleSuggestion = useCallback(
    (text: string) => {
      submit(text);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy],
  );

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Conversation area                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto"
      >
        {/* Subtle radial accent top-right */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 80% 10%, rgba(90,176,232,0.06) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-2xl px-4 py-6">
          {/* Empty state */}
          <AnimatePresence mode="wait">
            {messages.length === 0 && !busy && (
              <div className="flex min-h-[calc(100vh-18rem)] items-center justify-center">
                <EmptyState onSuggestion={handleSuggestion} />
              </div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div className="space-y-5">
            {messages.map((m, idx) => {
              const parts = (m.parts ?? []) as unknown as RenderPart[];
              const isLastMsg = idx === messages.length - 1;
              return (
                <MessageBubble
                  key={m.id}
                  role={m.role as "user" | "assistant"}
                  parts={parts}
                  index={idx}
                  isStreaming={isLastMsg && isStreaming && m.role === "assistant"}
                />
              );
            })}

            {/* Thinking indicator — shown while waiting for first tokens */}
            <AnimatePresence>
              {isSubmitted && (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  <ThinkingIndicator />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {error.message ||
                  "Something went wrong. Is OPENAI_API_KEY set on the deployment?"}
              </span>
            </motion.div>
          )}

          {/* Invisible bottom anchor for scrollIntoView */}
          <div ref={bottomRef} className="h-1" />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Composer — pinned at bottom; collapses while mobile nav is open     */}
      {/* ------------------------------------------------------------------ */}
      <motion.div
        animate={navOpen ? { opacity: 0, y: 24, pointerEvents: "none" } : { opacity: 1, y: 0, pointerEvents: "auto" }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-20 mx-auto w-full max-w-2xl px-4 pb-4 pt-2"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className={cn(
            "flex items-end gap-3 rounded-2xl bg-card px-4 py-3 shadow-lg",
            "ring-2 ring-transparent transition-all duration-200",
            "focus-within:ring-primary/25",
          )}
        >
          <GrowingTextarea
            value={input}
            onChange={setInput}
            onSubmit={() => submit(input)}
            disabled={busy}
            placeholder="Ask Scalar to find, enrich, or update…"
          />

          <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
            {/* Stop button — visible while busy */}
            <AnimatePresence>
              {busy && (
                <motion.div
                  key="stop"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.18 }}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => stop()}
                    className="h-8 w-8 rounded-full bg-muted/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Stop generating"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Send button */}
            <Button
              type="button"
              size="icon"
              onClick={() => submit(input)}
              disabled={busy || !input.trim()}
              className="h-8 w-8 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </motion.div>

        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/60">
          Scalar can make mistakes. Verify important information.
        </p>
      </motion.div>
    </div>
  );
}
