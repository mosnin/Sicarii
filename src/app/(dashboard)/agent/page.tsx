"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Send,
  Square,
  AlertCircle,
} from "lucide-react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScalarAvatar } from "@/components/dashboard/scalar-avatar";
import { ThinkingIndicator } from "@/components/dashboard/thinking-indicator";
import { useMobileNav } from "@/components/dashboard/dashboard-shell";
import { useRouter } from "next/navigation";
import { ItemCarousel } from "@/components/tool-ui/item-carousel";
import { safeParseSerializableItemCarousel } from "@/components/tool-ui/item-carousel/schema";
import { CitationList } from "@/components/tool-ui/citation";
import type { SerializableCitation } from "@/components/tool-ui/citation";
import { safeParseSerializableCitation } from "@/components/tool-ui/citation/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RenderPart = {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
  toolCallId?: string;
  output?: unknown;
};

// Map a finished tool result to an item-carousel payload, so discovery results
// render as a browsable strip of companies instead of a bare "done" chip.
// Returns null for tools that don't produce a company list, or an empty result.
function toolCarousel(name: string, output: unknown, key: string) {
  if (name !== "find_companies" && name !== "maps_leads") return null;
  if (!output || typeof output !== "object") return null;
  const o = output as {
    created?: Array<{ id?: string; name?: string; domain?: string | null }>;
    location?: string;
  };
  const items = (Array.isArray(o.created) ? o.created : [])
    .filter(
      (c): c is { id: string; name: string; domain?: string | null } =>
        Boolean(c && typeof c.id === "string" && typeof c.name === "string" && c.name.trim()),
    )
    .map((c) => ({ id: c.id, name: c.name, subtitle: c.domain ?? undefined }));
  if (items.length === 0) return null;
  const noun = items.length === 1 ? "company" : "companies";
  const title = o.location
    ? `${items.length} ${noun} in ${o.location}`
    : `${items.length} ${noun} added`;
  return safeParseSerializableItemCarousel({ id: `carousel-${key}`, title, items });
}

function hostOf(u: string): string | undefined {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// Map a web-research tool result to citation sources, so search results render
// as clickable, attributed citations instead of a bare "done" chip. Handles
// both search_web (a bare array) and google_search ({ results: [...] }).
function toolCitations(name: string, output: unknown, key: string): SerializableCitation[] | null {
  if (name !== "search_web" && name !== "google_search") return null;
  const rows: unknown[] = Array.isArray(output)
    ? output
    : output && typeof output === "object" && Array.isArray((output as { results?: unknown[] }).results)
      ? (output as { results: unknown[] }).results
      : [];
  const citations = rows
    .map((r, idx): SerializableCitation | null => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const href = typeof o.url === "string" ? o.url : typeof o.href === "string" ? o.href : "";
      const snippet =
        typeof o.content === "string" ? o.content : typeof o.description === "string" ? o.description : undefined;
      const title = typeof o.title === "string" && o.title.trim() ? o.title : (hostOf(href) ?? href);
      return safeParseSerializableCitation({
        id: `cite-${key}-${idx}`,
        href,
        title,
        snippet: snippet ? snippet.slice(0, 300) : undefined,
        domain: hostOf(href),
        type: "webpage",
      });
    })
    .filter((c): c is SerializableCitation => c !== null);
  return citations.length > 0 ? citations : null;
}

// ---------------------------------------------------------------------------
// ToolChip - an inline chip for tool-call parts
// ---------------------------------------------------------------------------

function ToolChip({ name, done }: { name: string; done: boolean }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-[4px] px-1.5 text-xs font-medium transition-colors",
        done
          ? "bg-primary-soft text-primary"
          : "bg-surface-2 text-fg-secondary",
      )}
    >
      <span className="font-mono">{name}</span>
      <span className="opacity-70">{done ? "done" : "working…"}</span>
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// BlinkingCaret - appears at end of a streaming assistant message
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
  const router = useRouter();

  return (
    <motion.div
      initial={reduce ? {} : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        ease: "easeOut",
        delay: Math.min(index * 0.02, 0.1),
      }}
      className={cn("flex items-start gap-2.5", isUser && "justify-end")}
    >
      {/* Avatar (assistant only; user messages are a right-aligned bubble) */}
      {!isUser && <ScalarAvatar active={isStreaming} />}

      {/* Content */}
      <div
        className={cn(
          "min-w-0 space-y-2",
          isUser ? "flex max-w-[78%] flex-col items-end" : "flex-1",
        )}
      >
        {parts.map((part, i) => {
          if (part.type === "text") {
            const isLastPart = i === parts.length - 1;
            return (
              <div
                key={i}
                className={cn(
                  "text-sm leading-relaxed text-foreground",
                  isUser
                    ? "rounded-[8px] bg-surface-2 px-3 py-2"
                    : "pt-0.5",
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
            const partKey = part.toolCallId ?? String(i);
            const carousel = done ? toolCarousel(name, part.output, partKey) : null;
            const citations = done ? toolCitations(name, part.output, partKey) : null;
            return (
              <div key={i} className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <ToolChip name={name} done={done} />
                </div>
                {carousel ? (
                  <ItemCarousel
                    id={carousel.id}
                    title={carousel.title}
                    items={carousel.items}
                    onItemClick={(itemId) => router.push(`/crm/entity/${itemId}`)}
                  />
                ) : null}
                {citations ? (
                  <CitationList
                    id={`citations-${partKey}`}
                    citations={citations}
                    onNavigate={(href) => window.open(href, "_blank", "noopener,noreferrer")}
                  />
                ) : null}
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
// EmptyState - centered welcome when no messages yet
// ---------------------------------------------------------------------------

function EmptyState() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? {} : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center"
    >
      {/* Favicon badge */}
      <div className="h-10 w-10 overflow-hidden rounded-[8px] border border-border">
        <Image src="/icon-512.png" alt="Scalar" width={40} height={40} className="h-full w-full object-cover" priority />
      </div>

      {/* Greeting */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          Hi, I&apos;m Scalar
        </h2>
        <p className="max-w-xs text-sm text-fg-tertiary">
          I search the web, enrich your contacts, and write straight into your
          CRM. Ask me anything.
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GrowingTextarea - auto-growing textarea that respects a max height
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
        "placeholder:text-fg-light",
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

  return (
    // Fill the shell's page area exactly so the composer is always visible
    // without page scroll. Mobile: 100dvh - 40px top bar - 20px pt-5 - 96px
    // main pb-24 (which clears the ~52px + safe-area bottom tab bar) = 156px.
    // Desktop (lg): 100dvh - 16px outer margin - 2px panel border - 40px top
    // bar - 20px pt-5 - 40px lg:pb-10 = 118px.
    <div className="flex h-[calc(100dvh-156px)] flex-col overflow-hidden lg:h-[calc(100dvh-118px)]">
      {/* ------------------------------------------------------------------ */}
      {/* Conversation area                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto"
      >
        <div className="relative z-10 mx-auto w-full max-w-2xl px-1 py-4 sm:px-2">
          {/* Empty state */}
          <AnimatePresence mode="wait">
            {messages.length === 0 && !busy && (
              <div className="flex min-h-[40dvh] items-center justify-center">
                <EmptyState />
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

            {/* Thinking indicator - shown while waiting for first tokens */}
            <AnimatePresence>
              {isSubmitted && (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.15 }}
                >
                  <ThinkingIndicator />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-4 flex items-start gap-2 rounded-[8px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} />
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
      {/* Composer - pinned at bottom; collapses while mobile nav is open     */}
      {/* ------------------------------------------------------------------ */}
      <motion.div
        animate={navOpen ? { opacity: 0, y: 8, pointerEvents: "none" } : { opacity: 1, y: 0, pointerEvents: "auto" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative z-20 mx-auto w-full max-w-2xl shrink-0 px-1 pt-2 sm:px-2"
      >
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
          className={cn(
            "rounded-[8px] border border-border bg-background",
            "transition-[border-color,box-shadow] duration-100",
            "focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15",
          )}
        >
          <div className="px-3 pt-2.5">
            <GrowingTextarea
              value={input}
              onChange={setInput}
              onSubmit={() => submit(input)}
              disabled={busy}
              placeholder="Ask Scalar to find, enrich, or update…"
            />
          </div>

          <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
            <span className="hidden pl-1 text-xs text-fg-light sm:inline">
              Enter to send · Shift + Enter for a new line
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <AnimatePresence>
                {busy && (
                  <motion.div
                    key="stop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={() => stop()}
                      className="hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Stop generating"
                    >
                      <Square className="h-3 w-3 fill-current" strokeWidth={1.6} />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="button"
                size="icon-sm"
                onClick={() => submit(input)}
                disabled={busy || !input.trim()}
                className="disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" strokeWidth={1.6} />
              </Button>
            </div>
          </div>
        </motion.div>

        <p className="mt-1.5 text-center text-xs text-fg-light">
          Scalar can make mistakes. Verify important information.
        </p>
      </motion.div>
    </div>
  );
}
