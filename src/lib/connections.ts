// Connect, disconnect and report on the operator's own mailbox and calendar.
//
// The whole feature turns on one rule, enforced here at connect time and
// nowhere else, so it can never be forgotten downstream:
//
//   FORWARD-ONLY. MailboxSync.syncFromAt is stamped `now` the moment a
//   connection goes ACTIVE, and nothing dated before it is ever imported.
//
// Wiring up a ten-year-old mailbox must not dump a decade of mail into the
// CRM. It is not a performance concern, it is a product one: a CRM that
// suddenly contains four thousand strangers is worse than one that contains
// nothing, and no amount of later cleanup makes the operator trust it again.
// It also happens to be what keeps us inside Composio's per-organisation rate
// limit, since a connect costs the same handful of calls whatever the size of
// the mailbox behind it.
//
// Same userId-first, OpError-on-ownership convention as crm-operations.ts:
// every function takes the tenant's userId as its first argument and every
// query is scoped to it.

import { Prisma, type ConnectedAccount, type MailboxSync } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/op-error";
import {
  getComposio,
  composioCall,
  authConfigIdFor,
  isComposioConfigured,
  scopesForProvider,
  configuredProviders,
  TRIGGERS_FOR_PROVIDER,
  MIN_POLL_INTERVAL_MINUTES,
  type ComposioProvider,
} from "@/lib/composio";

/* ------------------------------- Types -------------------------------- */

export interface ConnectionView {
  id: string;
  provider: ComposioProvider;
  status: "PENDING" | "ACTIVE" | "ERROR" | "REVOKED";
  accountEmail: string | null;
  scopes: string[];
  lastError: string | null;
  connectedAt: string | null;
  /** True when the operator has to go through consent again: the grant
   *  expired, was revoked at Google, or polling died on Composio's side. */
  needsReauth: boolean;
  sync: {
    status: "IDLE" | "SYNCING" | "ERROR" | "PAUSED";
    syncFromAt: string;
    lastSyncedAt: string | null;
    lastError: string | null;
    autoCreateContacts: boolean;
  } | null;
  triggers: { slug: string; active: boolean; lastEventAt: string | null; lastError: string | null }[];
}

const PROVIDERS: ComposioProvider[] = ["GMAIL", "GOOGLE_CALENDAR"];

function assertProvider(value: string): ComposioProvider {
  if (value === "GMAIL" || value === "GOOGLE_CALENDAR") return value;
  throw new OpError("provider must be GMAIL or GOOGLE_CALENDAR", 400);
}

/** The opaque per-tenant handle Composio stores against a connected account.
 *  There is no registration call: any stable string works, and ours is the
 *  tenant's account id (the workspace row in team context), so a webhook's
 *  `metadata.user_id` maps straight back to the account whose data it is. */
export function composioUserIdFor(userId: string): string {
  return userId;
}

/* ------------------------------- Reads -------------------------------- */

type ConnectionRow = ConnectedAccount & {
  sync: MailboxSync | null;
  triggers: { slug: string; active: boolean; lastEventAt: Date | null; lastError: string | null }[];
};

function toView(row: ConnectionRow): ConnectionView {
  return {
    id: row.id,
    provider: row.provider as ComposioProvider,
    status: row.status,
    accountEmail: row.accountEmail,
    scopes: row.scopes,
    lastError: row.lastError,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    needsReauth: row.status === "ERROR" || row.status === "REVOKED",
    sync: row.sync
      ? {
          status: row.sync.status,
          syncFromAt: row.sync.syncFromAt.toISOString(),
          lastSyncedAt: row.sync.lastSyncedAt?.toISOString() ?? null,
          lastError: row.sync.lastError,
          autoCreateContacts: row.sync.autoCreateContacts,
        }
      : null,
    triggers: row.triggers.map((t) => ({
      slug: t.slug,
      active: t.active,
      lastEventAt: t.lastEventAt?.toISOString() ?? null,
      lastError: t.lastError,
    })),
  };
}

/** Every connection this tenant has, plus which providers this deployment can
 *  actually offer, so the settings surface never shows a button that cannot
 *  work. */
export async function listConnections(userId: string): Promise<{
  connections: ConnectionView[];
  available: ComposioProvider[];
  configured: boolean;
}> {
  const rows = await prisma.connectedAccount.findMany({
    where: { userId },
    include: {
      sync: true,
      triggers: { select: { slug: true, active: true, lastEventAt: true, lastError: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return {
    connections: rows.map(toView),
    available: configuredProviders(),
    configured: isComposioConfigured(),
  };
}

/** Compact status for the MCP `connection_status` tool. */
export async function connectionStatus(userId: string) {
  const { connections, available, configured } = await listConnections(userId);
  return {
    composioConfigured: configured,
    available,
    connections: connections.map((c) => ({
      provider: c.provider,
      status: c.status,
      accountEmail: c.accountEmail,
      needsReauth: c.needsReauth,
      syncingSince: c.sync?.syncFromAt ?? null,
      lastSyncedAt: c.sync?.lastSyncedAt ?? null,
      autoCreateContacts: c.sync?.autoCreateContacts ?? false,
      lastError: c.lastError ?? c.sync?.lastError ?? null,
    })),
    note:
      connections.length === 0
        ? "No mailbox or calendar is connected. Ask the operator to connect one in Settings; first-party thread and meeting history is free and more reliable than any data vendor."
        : "Synced history starts at syncingSince. Nothing older than that is imported, by design.",
  };
}

/** The tenant's connection for one provider, or null. */
export async function getConnection(
  userId: string,
  provider: ComposioProvider,
): Promise<ConnectedAccount | null> {
  return prisma.connectedAccount.findFirst({ where: { userId, provider } });
}

async function ownedConnection(userId: string, id: string): Promise<ConnectedAccount> {
  const row = await prisma.connectedAccount.findUnique({ where: { id } });
  if (!row || row.userId !== userId) throw new OpError("Connection not found", 404);
  return row;
}

/* ------------------------------ Connect ------------------------------- */

export interface StartConnectionResult {
  connectionId: string;
  redirectUrl: string;
  composioConnectionId: string;
}

/**
 * Begin the OAuth handshake. Returns the URL the operator's browser must be
 * sent to.
 *
 * `connectedAccounts.initiate()` is RETIRED for Composio-managed OAuth and
 * throws ComposioLegacyConnectedAccountsEndpointRetiredError; `link()` is the
 * replacement. It returns `{ id: 'ca_*', redirectUrl }` and we persist that
 * `ca_*` BEFORE redirecting, so a user who closes the tab mid-consent leaves
 * behind a row we can reconcile instead of an orphaned grant on Composio's
 * side that we can never find again.
 *
 * `link()` refuses when an ACTIVE connected account already exists, which is
 * exactly right for a first connect and exactly wrong for a re-auth, so a
 * reconnect passes allowMultiple.
 */
export async function startConnection(
  userId: string,
  providerInput: string,
  callbackBaseUrl: string,
): Promise<StartConnectionResult> {
  const provider = assertProvider(providerInput);
  const authConfigId = authConfigIdFor(provider);
  if (!isComposioConfigured(provider) || !authConfigId) {
    throw new OpError(
      `${provider === "GMAIL" ? "Gmail" : "Google Calendar"} sync is not configured on this deployment.`,
      501,
    );
  }

  const scopes = [...scopesForProvider(provider)];
  const composioUserId = composioUserIdFor(userId);

  // Claim the row first so the callback has a stable id to come back to, and
  // so a half-finished consent is visible in Settings rather than invisible.
  const existing = await prisma.connectedAccount.findFirst({ where: { userId, provider } });
  const row = existing
    ? await prisma.connectedAccount.update({
        where: { id: existing.id },
        data: { status: "PENDING", authConfigId, composioUserId, scopes, lastError: null },
      })
    : await prisma.connectedAccount.create({
        data: { userId, provider, composioUserId, authConfigId, scopes, status: "PENDING" },
      });

  const callbackUrl = `${callbackBaseUrl.replace(/\/$/, "")}?ref=${encodeURIComponent(row.id)}`;
  // A reconnect is any row that has been live before. Without allowMultiple,
  // link() throws ComposioMultipleConnectedAccountsError against the still
  // ACTIVE account we are trying to replace.
  const isReconnect = Boolean(existing?.composioConnectionId);

  let request: { id: string; redirectUrl?: string | null };
  try {
    request = await composioCall(() =>
      getComposio().connectedAccounts.link(composioUserId, authConfigId, {
        callbackUrl,
        ...(isReconnect ? { allowMultiple: true } : {}),
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start the connection";
    await prisma.connectedAccount.update({
      where: { id: row.id },
      data: { status: "ERROR", lastError: message.slice(0, 500) },
    });
    throw new OpError(`Could not start the connection: ${message}`, 502);
  }

  if (!request?.redirectUrl) {
    await prisma.connectedAccount.update({
      where: { id: row.id },
      data: { status: "ERROR", lastError: "Composio returned no consent URL" },
    });
    throw new OpError("Composio returned no consent URL for this auth config.", 502);
  }

  // Persist ca_* BEFORE the redirect. This is the whole reason link() is
  // called from a server route and not the browser.
  await prisma.connectedAccount.update({
    where: { id: row.id },
    data: { composioConnectionId: request.id, status: "PENDING", lastError: null },
  });

  return { connectionId: row.id, redirectUrl: request.redirectUrl, composioConnectionId: request.id };
}

function accountEmailFrom(account: unknown): string | null {
  if (!account || typeof account !== "object") return null;
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > 4 || !node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === "string" && /email|user_?name/i.test(key) && value.includes("@")) {
        return value.toLowerCase();
      }
      const nested = walk(value, depth + 1);
      if (nested) return nested;
    }
    return null;
  };
  return walk(account, 0);
}

/**
 * Finish the handshake: confirm the connected account really is ACTIVE with
 * Composio (never trust the `status=success` query param Composio appends to
 * our callback, it is attacker-supplied by the time it reaches us), stamp the
 * forward-only cutoff, and register the polling triggers.
 */
export async function completeConnection(
  userId: string,
  connectionId: string,
): Promise<ConnectionView> {
  const row = await ownedConnection(userId, connectionId);
  if (!row.composioConnectionId) {
    throw new OpError("This connection was never started; try connecting again.", 400);
  }

  let account: { status?: string } & Record<string, unknown>;
  try {
    account = (await composioCall(() =>
      getComposio().connectedAccounts.get(row.composioConnectionId!),
    )) as { status?: string } & Record<string, unknown>;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not verify the connection";
    await prisma.connectedAccount.update({
      where: { id: row.id },
      data: { status: "ERROR", lastError: message.slice(0, 500) },
    });
    throw new OpError(`Could not verify the connection: ${message}`, 502);
  }

  if (String(account?.status ?? "").toUpperCase() !== "ACTIVE") {
    await prisma.connectedAccount.update({
      where: { id: row.id },
      data: {
        status: "ERROR",
        lastError: `Connection is ${String(account?.status ?? "unknown")}, not ACTIVE`,
      },
    });
    throw new OpError("The connection was not completed. Please try again.", 400);
  }

  const now = new Date();
  await prisma.connectedAccount.update({
    where: { id: row.id },
    data: {
      status: "ACTIVE",
      connectedAt: row.connectedAt ?? now,
      disconnectedAt: null,
      lastError: null,
      accountEmail: accountEmailFrom(account) ?? row.accountEmail,
    },
  });

  // The forward-only cutoff. Stamped once, on the FIRST successful connect,
  // and deliberately not moved on a re-auth: a reconnect after a token expiry
  // must not silently discard the window the operator was offline for.
  await prisma.mailboxSync.upsert({
    where: { connectedAccountId: row.id },
    update: { status: "IDLE", lastError: null, retryAfter: null },
    create: { userId, connectedAccountId: row.id, status: "IDLE", syncFromAt: now },
  });

  await registerTriggers(userId, row.id, row.provider as ComposioProvider, row.composioConnectionId);

  const fresh = await prisma.connectedAccount.findUnique({
    where: { id: row.id },
    include: {
      sync: true,
      triggers: { select: { slug: true, active: true, lastEventAt: true, lastError: true } },
    },
  });
  return toView(fresh as ConnectionRow);
}

/**
 * Register (or re-register) the polling triggers for a connection.
 *
 * `interval` is passed explicitly at the 15-minute floor every time. Composio
 * rejects anything lower as an API error on managed auth, and the trigger
 * schema's `default: 1` is stale, so relying on the default is a live bug
 * waiting for the first deploy that reads it.
 *
 * `connectedAccountId` is also passed explicitly. Omitting it makes Composio
 * pick "the first connected account for this user and toolkit", which is a
 * coin flip the moment a re-auth leaves two accounts behind.
 *
 * One trigger failing never fails the connect: the failure is recorded on its
 * SyncTrigger row so Settings can show "calendar sync did not start" without
 * throwing away a mailbox connection that did.
 */
export async function registerTriggers(
  userId: string,
  connectedAccountRowId: string,
  provider: ComposioProvider,
  composioConnectionId: string,
): Promise<void> {
  const composio = getComposio();
  const composioUserId = composioUserIdFor(userId);

  for (const slug of TRIGGERS_FOR_PROVIDER[provider]) {
    try {
      const created = (await composioCall(() =>
        composio.triggers.create(composioUserId, slug, {
          connectedAccountId: composioConnectionId,
          triggerConfig: { interval: MIN_POLL_INTERVAL_MINUTES },
        }),
      )) as { triggerId?: string; id?: string } | null;

      const composioTriggerId =
        (typeof created?.triggerId === "string" && created.triggerId) ||
        (typeof created?.id === "string" && created.id) ||
        null;

      await prisma.syncTrigger.upsert({
        where: { connectedAccountId_slug: { connectedAccountId: connectedAccountRowId, slug } },
        update: { composioTriggerId, active: true, lastError: null, userId },
        create: { userId, connectedAccountId: connectedAccountRowId, slug, composioTriggerId, active: true },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Trigger registration failed";
      console.error(`[connections] failed to register ${slug}`, e);
      await prisma.syncTrigger.upsert({
        where: { connectedAccountId_slug: { connectedAccountId: connectedAccountRowId, slug } },
        update: { active: false, lastError: message.slice(0, 500) },
        create: {
          userId,
          connectedAccountId: connectedAccountRowId,
          slug,
          active: false,
          lastError: message.slice(0, 500),
        },
      });
    }
  }
}

/* ---------------------------- Disconnect ------------------------------ */

/**
 * Disconnect: disable the triggers, delete the connected account at Composio
 * so the Google grant is actually revoked, then mark our rows.
 *
 * Local state flips even when Composio is unreachable. The alternative, a
 * disconnect that fails because a third party is down, leaves the operator
 * looking at a mailbox they have asked us twice to stop reading. Synced mail
 * and meetings are NOT deleted: they are CRM history the operator built, and
 * throwing it away is a separate, explicit decision.
 */
export async function disconnectConnection(userId: string, connectionId: string): Promise<void> {
  const row = await ownedConnection(userId, connectionId);
  const triggers = await prisma.syncTrigger.findMany({ where: { connectedAccountId: row.id } });
  const composio = isComposioConfigured() ? getComposio() : null;

  if (composio) {
    for (const trigger of triggers) {
      if (!trigger.composioTriggerId) continue;
      try {
        await composioCall(() => composio.triggers.disable(trigger.composioTriggerId!));
      } catch (e) {
        console.error(`[connections] could not disable trigger ${trigger.slug}`, e);
      }
    }
    if (row.composioConnectionId) {
      try {
        await composioCall(() => composio.connectedAccounts.delete(row.composioConnectionId!));
      } catch (e) {
        console.error("[connections] could not delete connected account", e);
      }
    }
  }

  await prisma.$transaction([
    prisma.syncTrigger.updateMany({
      where: { connectedAccountId: row.id },
      data: { active: false },
    }),
    prisma.mailboxSync.updateMany({
      where: { connectedAccountId: row.id },
      data: { status: "PAUSED" },
    }),
    prisma.connectedAccount.update({
      where: { id: row.id },
      data: {
        status: "REVOKED",
        disconnectedAt: new Date(),
        composioConnectionId: null,
        lastError: null,
      },
    }),
  ]);
}

/* ---------------------------- Preferences ----------------------------- */

/**
 * Toggle auto-creation of contacts from unknown participants. OFF by default,
 * and that default is the product: creating a contact is a decision, not a
 * side effect of syncing. A CRM that fills itself with everyone the operator
 * has ever been cc'd on is a mailing list, not a pipeline.
 */
export async function setAutoCreateContacts(
  userId: string,
  connectionId: string,
  enabled: boolean,
): Promise<ConnectionView> {
  const row = await ownedConnection(userId, connectionId);
  await prisma.mailboxSync.updateMany({
    where: { connectedAccountId: row.id, userId },
    data: { autoCreateContacts: enabled },
  });
  const fresh = await prisma.connectedAccount.findUnique({
    where: { id: row.id },
    include: {
      sync: true,
      triggers: { select: { slug: true, active: true, lastEventAt: true, lastError: true } },
    },
  });
  return toView(fresh as ConnectionRow);
}

/* ------------------------- Health, from webhooks ---------------------- */

/**
 * A tenant's sync has silently died. `composio.trigger.disabled` and
 * `composio.connected_account.expired` are the ONLY way we learn this: a
 * polling trigger that stops polling produces no events, and "no events" is
 * indistinguishable from "a quiet week" unless somebody tells us.
 *
 * Both are recorded as an ERROR on the connection so Settings can raise the
 * re-auth prompt, and the sync is PAUSED so nothing pretends to be current.
 */
export async function markConnectionUnhealthy(
  connectedAccountRowId: string,
  reason: string,
  opts: { slug?: string | null; expired?: boolean } = {},
): Promise<void> {
  const detail = reason.slice(0, 500);
  await prisma.$transaction([
    prisma.connectedAccount.updateMany({
      where: { id: connectedAccountRowId },
      data: { status: "ERROR", lastError: detail },
    }),
    prisma.mailboxSync.updateMany({
      where: { connectedAccountId: connectedAccountRowId },
      data: { status: opts.expired ? "PAUSED" : "ERROR", lastError: detail },
    }),
    ...(opts.slug
      ? [
          prisma.syncTrigger.updateMany({
            where: { connectedAccountId: connectedAccountRowId, slug: opts.slug },
            data: { active: false, lastError: detail },
          }),
        ]
      : [
          prisma.syncTrigger.updateMany({
            where: { connectedAccountId: connectedAccountRowId },
            data: { active: false, lastError: detail },
          }),
        ]),
  ]);
}

/** Stamp that a trigger delivered, for the "last synced" line in Settings. */
export async function markTriggerFired(
  connectedAccountRowId: string,
  slug: string,
  at: Date,
): Promise<void> {
  await prisma.syncTrigger.updateMany({
    where: { connectedAccountId: connectedAccountRowId, slug },
    data: { lastEventAt: at, lastError: null, active: true },
  });
}

export { PROVIDERS as CONNECTION_PROVIDERS };
export type { Prisma as PrismaNamespace };
