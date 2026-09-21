// Inbound classifier. Only REPLY advances CONTACTED -> REPLIED and
// attributes the bandit. Bounce / unsubscribe set doNotContact.
// Warmup never touches the CRM.

export const INBOUND_CLASSES = [
  "REPLY",
  "AUTO_REPLY",
  "OOO",
  "BOUNCE",
  "UNSUBSCRIBE",
  "WARMUP",
  "OTHER",
] as const;

export type InboundClass = (typeof INBOUND_CLASSES)[number];

export type ClassifyInput = {
  from: string;
  to: string;
  subject?: string | null;
  text: string;
  mailboxEmail?: string | null;
  warmupTargets?: string[];
  warmupSink?: string | null;
};

function norm(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function addr(raw: string | null | undefined): string {
  const trimmed = norm(raw);
  const angled = trimmed.match(/<([^>]+)>/);
  return (angled?.[1] ?? trimmed).replace(/^mailto:/, "");
}

const BOUNCE_FROM = /mailer-daemon@|postmaster@|mail-daemon@|bounce@|noreply-bounce@/i;
const BOUNCE_SUBJ =
  /delivery status|undeliverable|returned mail|mail delivery failed|failure notice|delivery failure|returned to sender/i;
const BOUNCE_BODY =
  /(?:^|\n)\s*(?:550|554|5\.1\.1|5\.7\.1)\b|user unknown|mailbox unavailable|recipient rejected|permanent failure/i;

const UNSUB_SUBJ = /\bunsubscribe\b|\bopt[ -]?out\b|remove me from/i;
const UNSUB_BODY =
  /please unsubscribe|remove me from (?:this|your) (?:list|emails)|stop emailing me|opt me out/i;

const OOO_SUBJ = /out of office|automatic reply|autoreply|auto-reply|vacation reply|ooo:/i;
const OOO_BODY =
  /i(?:'| a)?m (?:currently )?(?:out of the office|away from (?:the office|email))|on (?:annual )?leave until|limited access to email/i;

const AUTO_SUBJ = /auto[- ]?reply|automatic response|do not reply/i;
const AUTO_BODY = /this is an automated (?:message|response)|no-?reply@|do not reply to this/i;

export function classifyInbound(input: ClassifyInput): InboundClass {
  const from = addr(input.from);
  const subject = input.subject ?? "";
  const text = input.text ?? "";
  const hay = `${subject}\n${text}`;

  const targets = new Set(
    [...(input.warmupTargets ?? []), input.warmupSink, input.mailboxEmail]
      .map((v) => addr(v))
      .filter((v) => v.includes("@")),
  );
  if (targets.has(from)) return "WARMUP";

  if (BOUNCE_FROM.test(from) || BOUNCE_SUBJ.test(subject) || BOUNCE_BODY.test(hay)) {
    return "BOUNCE";
  }
  if (UNSUB_SUBJ.test(subject) || UNSUB_BODY.test(text)) return "UNSUBSCRIBE";
  if (OOO_SUBJ.test(subject) || OOO_BODY.test(text)) return "OOO";
  if (AUTO_SUBJ.test(subject) || AUTO_BODY.test(text)) return "AUTO_REPLY";
  if (from.includes("@") && text.trim().length > 0) return "REPLY";
  return "OTHER";
}

export function inboundTouchesCrm(cls: InboundClass): boolean {
  return cls === "REPLY";
}

export function inboundSetsDoNotContact(cls: InboundClass): boolean {
  return cls === "BOUNCE" || cls === "UNSUBSCRIBE";
}

export function inboundHaltsQueuedSend(cls: InboundClass): boolean {
  return cls === "REPLY" || cls === "BOUNCE" || cls === "UNSUBSCRIBE";
}
