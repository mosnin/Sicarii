import type { Queue } from "./cf";

export type MailboxJob =
  | { type: "warmup-tick" }
  | { type: "warmup-list"; cursor?: string | null; limit?: number }
  | { type: "warmup-one"; mailboxId: string }
  | { type: "send-slot-list"; cursor?: string | null; limit?: number }
  | { type: "send-one"; jobId: string }
  | { type: "outreach-tick"; cursor?: string | null; limit?: number }
  | {
      type: "send-email";
      userId: string;
      contactId: string;
      subject: string;
      body: string;
      mailboxId?: string;
      variantId?: string | null;
      allowWarming?: boolean;
    }
  | {
      type: "inbound-email";
      from: string;
      to: string;
      subject?: string;
      text: string;
      mailboxId?: string;
      providerId?: string;
      messageId?: string;
      inReplyTo?: string;
      references?: string;
    }
  | { type: "fulfill-poll" }
  | { type: "fulfill-list"; cursor?: string | null; limit?: number }
  | { type: "fulfill-one"; mailboxId?: string; orderId?: string }
  | { type: "imap-list"; cursor?: string | null; limit?: number }
  | { type: "imap-one"; mailboxId: string }
  | { type: "dns-list"; cursor?: string | null; limit?: number }
  | { type: "dns-one"; domainId: string };

export interface Env {
  ORIGIN_URL: string;
  WORKER_SECRET: string;
  SEND_QUEUE: Queue<MailboxJob>;
  INBOUND_QUEUE: Queue<MailboxJob>;
  FULFILL_QUEUE: Queue<MailboxJob>;
}

export function queueNameFor(job: MailboxJob): "SEND_QUEUE" | "INBOUND_QUEUE" | "FULFILL_QUEUE" {
  switch (job.type) {
    case "send-email":
    case "send-one":
    case "warmup-one":
    case "warmup-tick":
    case "outreach-tick":
      return "SEND_QUEUE";
    case "inbound-email":
    case "imap-one":
      return "INBOUND_QUEUE";
    default:
      return "FULFILL_QUEUE";
  }
}

export function isListJob(
  job: MailboxJob,
): job is Extract<
  MailboxJob,
  { type: "warmup-list" | "fulfill-list" | "send-slot-list" | "outreach-tick" | "imap-list" | "dns-list" }
> {
  return (
    job.type === "warmup-list" ||
    job.type === "fulfill-list" ||
    job.type === "send-slot-list" ||
    job.type === "outreach-tick" ||
    job.type === "imap-list" ||
    job.type === "dns-list"
  );
}
