// Teams: share a lead from a personal account into a team workspace.
//
// Semantics (docs/engineering/teams-plan-2026-07-11.md): a DEEP COPY with
// dedup-merge, never a live link (cross-tenant FKs leak edits/deletes) and
// never a move (the user keeps their personal record). This is the only code
// path in the system that touches two tenants; ownership is asserted on the
// personal side and membership on the team side, and the whole copy runs in
// one transaction.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { OpError } from "@/lib/crm-operations";

const normDomain = (d?: string | null) =>
  d?.toLowerCase().replace(/^www\./, "").trim() || undefined;

// Fill only the target's empty columns from the source (the enrichEntity
// pattern): a share never overwrites what the team already knows.
function fillEmpty<T extends Record<string, unknown>>(
  target: T,
  source: T,
  fields: (keyof T)[],
): Partial<T> {
  const patch: Partial<T> = {};
  for (const f of fields) {
    if ((target[f] == null || target[f] === "") && source[f] != null && source[f] !== "") {
      patch[f] = source[f];
    }
  }
  return patch;
}

export interface ShareResult {
  contactId: string; // the team-side contact id
  entityId: string | null; // the team-side entity id, when the lead had one
  merged: boolean; // true when deduped into an existing team contact
  copied: { activities: number; emails: number; calls: number; socialMessages: number };
}

/**
 * Copy a personal contact (and its company, history, and provenance) into a
 * team workspace. Dedup: entity by domain then name; contact by email then
 * (name, company). On duplicate, fill empty fields and union tags instead of
 * creating a second row. `includeMessages: false` skips email/call/social
 * bodies (history stays personal) while still sharing the record itself.
 */
export async function shareContactToWorkspace(opts: {
  actorUserId: string; // personal account row of the human sharing
  actorName?: string | null;
  workspaceId: string;
  contactId: string;
  includeMessages?: boolean;
}): Promise<ShareResult> {
  const { actorUserId, workspaceId, contactId } = opts;
  const includeMessages = opts.includeMessages ?? true;

  // The two tenant assertions. Everything below stands on these.
  const membership = await prisma.teamMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
  });
  if (!membership) throw new OpError("You are not a member of that team.", 403);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      entity: true,
      emails: { orderBy: { createdAt: "asc" }, take: 200 },
      calls: { orderBy: { createdAt: "asc" }, take: 200 },
      socialMessages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!contact || contact.userId !== actorUserId) throw new OpError("Contact not found", 404);

  const activities = await prisma.activity.findMany({
    where: { contactId, userId: actorUserId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const provenance = await prisma.fieldProvenance.findMany({
    where: { recordType: "contact", recordId: contactId },
  });

  const sharedBy = opts.actorName ? `shared by ${opts.actorName}` : "shared from a personal CRM";

  return prisma.$transaction(async (tx) => {
    /* ── Entity: dedup by domain then name, else copy ─────────────────── */
    let teamEntityId: string | null = null;
    if (contact.entity) {
      const src = contact.entity;
      const domain = normDomain(src.domain);
      const existing =
        (domain
          ? await tx.entity.findFirst({
              where: { userId: workspaceId, domain: { equals: domain, mode: "insensitive" } },
            })
          : null) ??
        (await tx.entity.findFirst({
          where: { userId: workspaceId, name: { equals: src.name.trim(), mode: "insensitive" } },
        }));
      if (existing) {
        const patch = fillEmpty(
          existing as unknown as Record<string, unknown>,
          src as unknown as Record<string, unknown>,
          ["website", "phone", "industry", "location", "description", "size", "logoUrl"],
        ) as Prisma.EntityUncheckedUpdateInput;
        if (Object.keys(patch).length > 0) {
          await tx.entity.update({ where: { id: existing.id }, data: patch });
        }
        teamEntityId = existing.id;
      } else {
        const created = await tx.entity.create({
          data: {
            userId: workspaceId,
            name: src.name,
            domain: src.domain,
            website: src.website,
            logoUrl: src.logoUrl,
            phone: src.phone,
            industry: src.industry,
            location: src.location,
            lat: src.lat,
            lng: src.lng,
            description: src.description,
            size: src.size,
            status: src.status,
            source: "shared",
            sharedFromId: src.id,
            tags: src.tags,
            notes: src.notes,
            ...(src.enrichment !== null
              ? { enrichment: src.enrichment as Prisma.InputJsonValue }
              : {}),
          },
        });
        teamEntityId = created.id;
      }
    }

    /* ── Contact: dedup by email then (name, company), else copy ──────── */
    const email = contact.email?.trim().toLowerCase();
    const existing =
      (email
        ? await tx.contact.findFirst({
            where: { userId: workspaceId, email: { equals: email, mode: "insensitive" } },
          })
        : null) ??
      (contact.name && contact.company
        ? await tx.contact.findFirst({
            where: {
              userId: workspaceId,
              name: { equals: contact.name.trim(), mode: "insensitive" },
              company: { equals: contact.company.trim(), mode: "insensitive" },
            },
          })
        : null);

    let teamContactId: string;
    let merged = false;
    if (existing) {
      merged = true;
      const patch = fillEmpty(
        existing as unknown as Record<string, unknown>,
        contact as unknown as Record<string, unknown>,
        ["name", "email", "phone", "company", "title", "website", "linkedin",
         "facebook", "instagram", "twitter", "location", "imageUrl"],
      ) as Prisma.ContactUncheckedUpdateInput;
      patch.tags = Array.from(new Set([...existing.tags, ...contact.tags]));
      if (!existing.entityId && teamEntityId) patch.entityId = teamEntityId;
      await tx.contact.update({ where: { id: existing.id }, data: patch });
      teamContactId = existing.id;
    } else {
      const created = await tx.contact.create({
        data: {
          userId: workspaceId,
          entityId: teamEntityId,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
          title: contact.title,
          website: contact.website,
          linkedin: contact.linkedin,
          facebook: contact.facebook,
          instagram: contact.instagram,
          twitter: contact.twitter,
          location: contact.location,
          imageUrl: contact.imageUrl,
          status: contact.status,
          source: "shared",
          sharedFromId: contact.id,
          tags: contact.tags,
          notes: contact.notes,
          lastContactedAt: contact.lastContactedAt,
          ...(contact.enrichment !== null
            ? { enrichment: contact.enrichment as Prisma.InputJsonValue }
            : {}),
        },
      });
      teamContactId = created.id;
    }

    /* ── History: activities always; message bodies only when asked ───── */
    const counts = { activities: 0, emails: 0, calls: 0, socialMessages: 0 };
    if (activities.length > 0) {
      const r = await tx.activity.createMany({
        data: activities.map((a) => ({
          userId: workspaceId,
          contactId: teamContactId,
          entityId: null,
          kind: a.kind,
          body: a.body,
          channel: a.channel,
          actorLabel: sharedBy,
          createdAt: a.createdAt,
        })),
      });
      counts.activities = r.count;
    }
    if (includeMessages) {
      if (contact.emails.length > 0) {
        const r = await tx.contactEmail.createMany({
          data: contact.emails.map((m) => ({
            contactId: teamContactId,
            direction: m.direction,
            fromAddr: m.fromAddr,
            toAddr: m.toAddr,
            subject: m.subject,
            body: m.body,
            savedAsContext: m.savedAsContext,
            sentAt: m.sentAt,
            createdAt: m.createdAt,
          })),
        });
        counts.emails = r.count;
      }
      if (contact.calls.length > 0) {
        const r = await tx.contactCall.createMany({
          data: contact.calls.map((c) => ({
            contactId: teamContactId,
            direction: c.direction,
            fromNumber: c.fromNumber,
            toNumber: c.toNumber,
            status: c.status,
            durationSec: c.durationSec,
            summary: c.summary,
            transcript: c.transcript,
            recordingUrl: c.recordingUrl,
            savedAsContext: c.savedAsContext,
            startedAt: c.startedAt,
            createdAt: c.createdAt,
          })),
        });
        counts.calls = r.count;
      }
      if (contact.socialMessages.length > 0) {
        const r = await tx.contactSocialMessage.createMany({
          data: contact.socialMessages.map((m) => ({
            contactId: teamContactId,
            channel: m.channel,
            direction: m.direction,
            body: m.body,
            threadRef: m.threadRef,
            savedAsContext: m.savedAsContext,
            sentAt: m.sentAt,
            createdAt: m.createdAt,
          })),
        });
        counts.socialMessages = r.count;
      }
    }

    /* ── Provenance: re-key so "via explorium, 3d ago" survives the share ─ */
    for (const p of provenance) {
      await tx.fieldProvenance.upsert({
        where: {
          recordType_recordId_field: {
            recordType: "contact",
            recordId: teamContactId,
            field: p.field,
          },
        },
        update: {},
        create: {
          recordType: "contact",
          recordId: teamContactId,
          field: p.field,
          source: p.source,
          confidence: p.confidence,
          valueSnapshot: p.valueSnapshot,
          retrievedAt: p.retrievedAt,
          verifiedAt: p.verifiedAt,
          stale: p.stale,
        },
      });
    }

    // The share itself, on the team-side record.
    await tx.activity.create({
      data: {
        userId: workspaceId,
        contactId: teamContactId,
        kind: "note",
        body: merged
          ? `Merged from a shared personal contact (${sharedBy}).`
          : `Shared into the team CRM (${sharedBy}).`,
        actorId: actorUserId,
        actorLabel: sharedBy,
      },
    });

    return { contactId: teamContactId, entityId: teamEntityId, merged, copied: counts };
  });
}
