// SMTP + IMAP transport for mailboxes we hold credentials for: Google
// Workspace / Microsoft 365 inboxes bought from PremiumInboxes (delivered as a
// CSV of address + app password + host/port), or any inbox the operator
// brings. Sending uses nodemailer over STARTTLS/TLS; reading polls IMAP by UID
// so a sync cursor is a plain integer. Spam-folder rescue (moving our own
// warmup mail from Junk back to INBOX) is what teaches Google/Microsoft that
// the sender is wanted, and is only possible here, not on API providers.
//
// This module never touches the database; callers pass decrypted credentials
// and persist whatever comes back.

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import { randomBytes } from "crypto";

export interface SmtpCredentials {
  address: string;
  displayName?: string | null;
  username: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  imapHost?: string | null;
  imapPort?: number | null;
}

export interface SmtpSendInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string[] | null;
  headers?: Record<string, string>;
}

export interface SmtpSendResult {
  rfcMessageId: string;
  accepted: string[];
  rejected: string[];
}

/** A Message-ID we mint ourselves so threading works even when the SMTP
 *  server rewrites nothing back to us. RFC 5322: <unique@domain>. */
export function mintMessageId(address: string): string {
  const domain = address.split("@")[1] || "scalar.local";
  return `<${Date.now().toString(36)}.${randomBytes(9).toString("hex")}@${domain}>`;
}

export async function smtpSend(creds: SmtpCredentials, input: SmtpSendInput): Promise<SmtpSendResult> {
  const secure = creds.smtpPort === 465;
  const transport = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure,
    requireTLS: !secure,
    auth: { user: creds.username, pass: creds.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const messageId = mintMessageId(creds.address);
  try {
    const info = await transport.sendMail({
      from: creds.displayName ? { name: creds.displayName, address: creds.address } : creds.address,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      messageId,
      ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
      ...(input.references && input.references.length ? { references: input.references } : {}),
      headers: input.headers ?? {},
    });
    return {
      rfcMessageId: info.messageId || messageId,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
    };
  } finally {
    transport.close();
  }
}

/** Connection check without sending anything: proves host/port/credentials. */
export async function smtpVerify(creds: SmtpCredentials): Promise<{ ok: boolean; error?: string }> {
  const secure = creds.smtpPort === 465;
  const transport = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure,
    requireTLS: !secure,
    auth: { user: creds.username, pass: creds.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
  try {
    await transport.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    transport.close();
  }
}

/* ------------------------------- IMAP -------------------------------- */

export interface ImapMessage {
  uid: number;
  folder: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  references: string[];
  from: string;
  to: string[];
  subject?: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
  date?: Date;
}

export interface ImapFetchResult {
  messages: ImapMessage[];
  /** Highest UID seen (INBOX); persist as the next cursor. */
  lastUid: number;
  /** UIDs of OUR warmup mail found in spam and moved back to INBOX. */
  rescuedFromSpam: number;
}

function addr(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const list = Array.isArray(a) ? a : [a];
  return list.flatMap((x) => x.value.map((v) => (v.address ?? "").toLowerCase()).filter(Boolean));
}

function toImapMessage(uid: number, folder: string, parsed: ParsedMail): ImapMessage {
  const headers: Record<string, string> = {};
  for (const [k, v] of parsed.headers) {
    if (typeof v === "string") headers[k.toLowerCase()] = v;
    else if (v && typeof v === "object" && "text" in v && typeof (v as { text?: unknown }).text === "string") {
      headers[k.toLowerCase()] = (v as { text: string }).text;
    }
  }
  const refs = parsed.references
    ? Array.isArray(parsed.references)
      ? parsed.references
      : [parsed.references]
    : [];
  return {
    uid,
    folder,
    rfcMessageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    references: refs,
    from: addr(parsed.from)[0] ?? "",
    to: addr(parsed.to),
    subject: parsed.subject,
    text: parsed.text,
    html: typeof parsed.html === "string" ? parsed.html : undefined,
    headers,
    date: parsed.date,
  };
}

function imapClient(creds: SmtpCredentials): ImapFlow {
  return new ImapFlow({
    host: creds.imapHost ?? "",
    port: creds.imapPort ?? 993,
    secure: (creds.imapPort ?? 993) === 993,
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    emitLogs: false,
  });
}

const SPAM_FOLDERS = ["[Gmail]/Spam", "Junk", "Junk Email", "Spam", "INBOX.Junk", "INBOX.Spam"];

/**
 * Pull INBOX messages with UID > sinceUid, then look in the spam folder for
 * any mail carrying our warmup marker header and move it back to INBOX.
 * `warmupHeader` is the lowercase header name that marks Scalar warmup mail.
 */
export async function imapFetchNew(
  creds: SmtpCredentials,
  sinceUid: number,
  opts: { limit?: number; warmupHeader?: string } = {},
): Promise<ImapFetchResult> {
  if (!creds.imapHost) throw new Error("This mailbox has no IMAP host configured.");
  const limit = opts.limit ?? 50;
  const client = imapClient(creds);
  await client.connect();
  const out: ImapMessage[] = [];
  let lastUid = sinceUid;
  let rescued = 0;
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const range = sinceUid > 0 ? `${sinceUid + 1}:*` : "1:*";
      let count = 0;
      for await (const msg of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= sinceUid) continue; // "*" can echo the last UID back
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        out.push(toImapMessage(msg.uid, "INBOX", parsed));
        if (msg.uid > lastUid) lastUid = msg.uid;
        if (++count >= limit) break;
      }
    } finally {
      lock.release();
    }

    if (opts.warmupHeader) {
      const folders = await client.list();
      const spam = folders.find((f) => SPAM_FOLDERS.includes(f.path) || f.specialUse === "\\Junk");
      if (spam) {
        const lock = await client.getMailboxLock(spam.path);
        try {
          const uids = (await client.search({ header: { [opts.warmupHeader]: "" } }, { uid: true })) || [];
          if (Array.isArray(uids) && uids.length > 0) {
            const moved = await client.messageMove(uids, "INBOX", { uid: true });
            if (moved) rescued = uids.length;
          }
        } finally {
          lock.release();
        }
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { messages: out, lastUid, rescuedFromSpam: rescued };
}

export async function imapVerify(creds: SmtpCredentials): Promise<{ ok: boolean; error?: string }> {
  if (!creds.imapHost) return { ok: false, error: "No IMAP host" };
  const client = imapClient(creds);
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Well-known hosts so an import only needs address + password. */
export function guessHosts(address: string, provider?: "google" | "microsoft" | null) {
  const p = provider ?? (/(gmail|googlemail)\./i.test(address) ? "google" : null);
  if (p === "google") return { smtpHost: "smtp.gmail.com", smtpPort: 587, imapHost: "imap.gmail.com", imapPort: 993 };
  if (p === "microsoft") return { smtpHost: "smtp.office365.com", smtpPort: 587, imapHost: "outlook.office365.com", imapPort: 993 };
  return null;
}
