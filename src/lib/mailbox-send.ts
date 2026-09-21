// Actual delivery. SMTP is the default (Premium Inboxes hands you Workspace
// SMTP). AgentMail and Bird are optional adapters when those keys exist.
// Warmup and outreach both go through sendMailboxMessage so daily caps and
// event logging stay in one place (the ops layer calls this, then records).

import nodemailer from "nodemailer";
import { fetchWithTimeout } from "@/lib/http";
import { decryptSmtpSecret, type SmtpSecret } from "@/lib/mailbox-crypto";

export interface OutboundMessage {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface SendResult {
  providerId?: string;
  accepted: boolean;
}

export async function sendViaSmtp(secret: SmtpSecret, message: OutboundMessage): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: secret.host,
    port: secret.port,
    secure: secret.secure,
    auth: { user: secret.username, pass: secret.password },
    connectionTimeout: 15_000,
    socketTimeout: 20_000,
  });
  const info = await transporter.sendMail({
    from: message.fromName ? `"${message.fromName}" <${message.from}>` : message.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    replyTo: message.replyTo ?? message.from,
  });
  return { accepted: true, providerId: info.messageId };
}

export async function sendViaSmtpCiphertext(ciphertext: string, message: OutboundMessage): Promise<SendResult> {
  return sendViaSmtp(decryptSmtpSecret(ciphertext), message);
}

export async function sendViaAgentMail(apiKey: string, inboxId: string, message: OutboundMessage): Promise<SendResult> {
  const res = await fetchWithTimeout(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AgentMail send failed (${res.status}): ${text.slice(0, 200)}`);
  const data = (text ? JSON.parse(text) : {}) as { id?: string; message_id?: string };
  return { accepted: true, providerId: data.message_id ?? data.id };
}

export async function sendViaBird(message: OutboundMessage): Promise<SendResult> {
  const key = process.env.BIRD_API_KEY?.trim();
  const workspace = process.env.BIRD_WORKSPACE_ID?.trim();
  const channel = process.env.BIRD_EMAIL_CHANNEL_ID?.trim();
  if (!key || !workspace || !channel) {
    throw new Error("Bird is not configured (BIRD_API_KEY, BIRD_WORKSPACE_ID, BIRD_EMAIL_CHANNEL_ID).");
  }
  const res = await fetchWithTimeout(`https://api.bird.com/workspaces/${workspace}/channels/${channel}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receiver: { contacts: [{ identifierValue: message.to, identifierKey: "emailaddress" }] },
      body: { type: "text", text: { text: message.text } },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bird send failed (${res.status}): ${text.slice(0, 200)}`);
  const data = (text ? JSON.parse(text) : {}) as { id?: string };
  return { accepted: true, providerId: data.id };
}

export function birdConfigured(): boolean {
  return Boolean(
    process.env.BIRD_API_KEY?.trim() &&
      process.env.BIRD_WORKSPACE_ID?.trim() &&
      process.env.BIRD_EMAIL_CHANNEL_ID?.trim(),
  );
}
