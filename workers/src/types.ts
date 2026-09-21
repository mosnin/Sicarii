import type { Queue } from "./cf";

export type MailboxJob =
  | { type: "warmup-tick" }
  | { type: "warmup-list" }
  | { type: "warmup-one"; mailboxId: string }
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
    }
  | { type: "fulfill-poll" }
  | { type: "fulfill-list" }
  | { type: "fulfill-one"; mailboxId?: string; orderId?: string };

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
    case "warmup-one":
    case "warmup-tick":
      return "SEND_QUEUE";
    case "inbound-email":
      return "INBOUND_QUEUE";
    default:
      return "FULFILL_QUEUE";
  }
}
