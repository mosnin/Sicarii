// Inbound message classifier. Pure and deterministic (no LLM): every class
// here drives a CRM side effect that must be predictable, auditable and
// cheap - marking a person do-not-contact on a guess would be worse than
// missing an unsubscribe. The rules are conservative: when nothing matches,
// the message is a REPLY (a human wrote back), which only ever ADVANCES the
// contact and never removes anyone from a list.

export type InboundClassName =
  | "REPLY"
  | "AUTO_REPLY"
  | "OUT_OF_OFFICE"
  | "BOUNCE"
  | "UNSUBSCRIBE"
  | "WARMUP"
  | "OTHER";

export interface ClassifyInput {
  fromAddr: string;
  subject?: string | null;
  text?: string | null;
  headers?: Record<string, string | undefined>;
  /** True when the message carries Scalar's warmup marker header or tag. */
  warmupMarker?: boolean;
}

export interface Classification {
  klass: InboundClassName;
  note: string;
}

export const WARMUP_HEADER = "x-scalar-warmup";

const BOUNCE_SENDERS = /^(mailer-daemon|postmaster|mail-daemon|bounce|noreply\+bounces)@/i;
const BOUNCE_SUBJECT = /(undeliver|delivery (status|failure)|returned mail|failure notice|mail delivery failed|could not be delivered|address not found)/i;
const BOUNCE_BODY = /(550[- ]5\.1\.1|user unknown|no such user|mailbox (unavailable|not found|does not exist)|recipient address rejected|address rejected|does not exist)/i;

const OOO_SUBJECT = /(out of (the )?office|ooo\b|automatic reply|autoreply|auto-reply|away from (my )?(email|the office)|on (annual|parental|maternity|paternity) leave|on vacation|on holiday)/i;
const OOO_BODY = /(i am|i'm) (currently )?(out of (the )?office|away|on leave|on vacation|travel(l)?ing)|will (be )?(return|be back)|limited access to (my )?email/i;

const UNSUB = /\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (contact|email) me|opt me out|not interested,? (please )?(stop|remove)|no longer (wish|want) to receive|cease and desist)\b/i;

export function classifyInbound(input: ClassifyInput): Classification {
  const from = (input.fromAddr || "").trim().toLowerCase();
  const subject = (input.subject || "").trim();
  const text = (input.text || "").trim();
  const headers = lowerKeys(input.headers ?? {});

  if (input.warmupMarker || headers[WARMUP_HEADER]) {
    return { klass: "WARMUP", note: "Scalar warmup marker present" };
  }

  if (BOUNCE_SENDERS.test(from) || BOUNCE_SUBJECT.test(subject)) {
    return { klass: "BOUNCE", note: "Delivery status notification" };
  }
  if (BOUNCE_BODY.test(text.slice(0, 4000)) && /daemon|postmaster|delivery/i.test(from + " " + subject)) {
    return { klass: "BOUNCE", note: "Body carries a permanent-failure code" };
  }

  // Unsubscribe wins over auto-reply detection: a human saying "stop" in an
  // otherwise auto-looking message must still be honored.
  const firstLines = text.slice(0, 600);
  if (UNSUB.test(subject) || UNSUB.test(firstLines)) {
    return { klass: "UNSUBSCRIBE", note: "Opt-out language in subject or opening lines" };
  }

  const autoSubmitted = headers["auto-submitted"];
  const isAuto =
    (autoSubmitted && autoSubmitted.toLowerCase() !== "no") ||
    Boolean(headers["x-autoreply"]) ||
    Boolean(headers["x-autorespond"]) ||
    /^(yes|auto-replied|auto-generated)/i.test(headers["precedence"] ?? "") ||
    /^(bulk|junk|auto_reply)$/i.test(headers["precedence"] ?? "");

  if (OOO_SUBJECT.test(subject) || (isAuto && OOO_BODY.test(firstLines)) || OOO_BODY.test(firstLines.slice(0, 300))) {
    return { klass: "OUT_OF_OFFICE", note: "Out-of-office pattern" };
  }
  if (isAuto) {
    return { klass: "AUTO_REPLY", note: `Auto-Submitted / Precedence header (${autoSubmitted ?? headers["precedence"] ?? "auto"})` };
  }

  if (!text && !subject) return { klass: "OTHER", note: "Empty message" };
  return { klass: "REPLY", note: "Human reply (no bounce, opt-out or auto-reply signal)" };
}

function lowerKeys(h: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

/** Pull just the address out of "Name <addr>" / "addr" forms. */
export function extractAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}
