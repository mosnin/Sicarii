// Thin IMAP poll. One mailbox per job. Fetches new mail and hands each
// message to ingestInboundEmail. Skip if no IMAP credentials. No vendor
// lock-in: imapflow talks to the mailbox the operator already has.

import { prisma } from "@/lib/prisma";
import { decryptSmtpSecret, openUserSecret } from "@/lib/mailbox-crypto";
import { ingestInboundEmail } from "@/lib/mailbox-inbound";

const IMAP_FETCH_CAP = 20;

export type ImapSecret = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

export function imapSecretFromMailbox(box: {
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecure?: boolean | null;
  imapCiphertext?: string | null;
  smtpCiphertext?: string | null;
}): ImapSecret | null {
  if (box.imapCiphertext) {
    const raw = openUserSecret(box.imapCiphertext);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<ImapSecret>;
      if (parsed.host && parsed.username && parsed.password) {
        return {
          host: parsed.host,
          port: parsed.port ?? 993,
          secure: parsed.secure !== false,
          username: parsed.username,
          password: parsed.password,
        };
      }
    } catch {
      return null;
    }
  }
  if (box.imapHost && box.smtpCiphertext) {
    try {
      const smtp = decryptSmtpSecret(box.smtpCiphertext);
      return {
        host: box.imapHost,
        port: box.imapPort ?? 993,
        secure: box.imapSecure !== false,
        username: smtp.username,
        password: smtp.password,
      };
    } catch {
      return null;
    }
  }
  return null;
}

type ImapFetch = {
  uid: number;
  envelope?: { from?: { address?: string }[]; subject?: string };
  source?: Buffer | { toString: (enc?: string) => string };
};

function envelopeFrom(fetch: ImapFetch): { from: string; subject?: string; text: string } {
  const from = fetch.envelope?.from?.[0]?.address ?? "";
  const subject = fetch.envelope?.subject;
  const raw = fetch.source ? fetch.source.toString("utf8") : "";
  const text = extractPlaintext(raw);
  return { from, subject, text };
}

export function extractPlaintext(raw: string): string {
  if (!raw.trim()) return "";
  const body = raw.includes("\r\n\r\n") ? raw.split(/\r\n\r\n/).slice(1).join("\n\n") : raw;
  const stripped = body
    .replace(/<[^>]+>/g, " ")
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 20_000);
}

export async function pollMailboxImap(
  mailboxId: string,
): Promise<{ fetched: number; ingested: number; skipped?: string }> {
  const box = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!box) return { fetched: 0, ingested: 0, skipped: "missing" };
  const secret = imapSecretFromMailbox(box);
  if (!secret) return { fetched: 0, ingested: 0, skipped: "no_imap" };

  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: secret.host,
    port: secret.port,
    secure: secret.secure,
    auth: { user: secret.username, pass: secret.password },
    logger: false,
  });

  let fetched = 0;
  let ingested = 0;
  let maxUid = box.lastImapUid ?? 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const sinceUid = (box.lastImapUid ?? 0) + 1;
      const range = `${sinceUid}:*`;
      for await (const msg of client.fetch(range, { envelope: true, source: true, uid: true })) {
        const uid = Number(msg.uid ?? 0);
        if (!uid || uid <= (box.lastImapUid ?? 0)) continue;
        fetched += 1;
        if (uid > maxUid) maxUid = uid;
        if (fetched > IMAP_FETCH_CAP) break;
        const parsed = envelopeFrom(msg as ImapFetch);
        if (!parsed.from.includes("@") || !parsed.text) continue;
        await ingestInboundEmail({
          from: parsed.from,
          to: box.email,
          subject: parsed.subject,
          text: parsed.text,
          mailboxId: box.id,
          providerId: `imap:${uid}`,
        });
        ingested += 1;
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  await prisma.mailbox.update({
    where: { id: box.id },
    data: {
      lastImapUid: maxUid > 0 ? maxUid : box.lastImapUid,
      lastInboundAt: ingested > 0 ? new Date() : box.lastInboundAt,
    },
  });
  return { fetched, ingested };
}
