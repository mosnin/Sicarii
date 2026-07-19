-- Scalar — complete Supabase/Postgres schema
-- Mirrors prisma/schema.prisma. Run this once in the Supabase SQL Editor
-- against a fresh database. Safe to re-run (guards with IF NOT EXISTS where possible).
--
-- After running this, `prisma db push` / `prisma generate` will see the schema as
-- already in sync. The app generates row ids (uuid) and updatedAt itself, so no
-- DB-side defaults are used for those — exactly what Prisma expects.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Extensions
-- ─────────────────────────────────────────────────────────────────────────────
-- pgvector powers the agent's token-efficient recall (memory_chunks.embedding).
CREATE EXTENSION IF NOT EXISTS vector;
-- gen_random_uuid() lives here (used only if you insert rows by hand).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "EntityStatus" AS ENUM ('NEW', 'ENRICHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ContactStatus" AS ENUM (
    'NEW', 'ENRICHED', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'WON', 'LOST', 'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "Emaildirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SocialChannel" AS ENUM ('LINKEDIN', 'X', 'INSTAGRAM', 'FACEBOOK', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SocialDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- users — mirrored from Clerk via the Clerk webhook
CREATE TABLE IF NOT EXISTS "users" (
  "id"        TEXT NOT NULL,
  "clerkId"   TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "firstName" TEXT,
  "lastName"  TEXT,
  "imageUrl"  TEXT,
  "role"      TEXT NOT NULL DEFAULT 'member',
  "accountType"      TEXT NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_clerkId_key" ON "users" ("clerkId");

-- conversations — a chat with the Scalar agent (fresh one per page load)
CREATE TABLE IF NOT EXISTS "conversations" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "title"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "conversations_userId_idx" ON "conversations" ("userId");

-- messages — individual turns in a conversation
CREATE TABLE IF NOT EXISTS "messages" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role"           TEXT NOT NULL,
  "content"        TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "messages_conversationId_idx" ON "messages" ("conversationId");

-- memory_chunks — token-efficient vector memory (pgvector)
CREATE TABLE IF NOT EXISTS "memory_chunks" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "refId"     TEXT,
  "content"   TEXT NOT NULL,
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_chunks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "memory_chunks_userId_idx" ON "memory_chunks" ("userId");

-- api_keys — per-user key for the MCP server / REST API (only the hash is stored)
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "hashedKey"  TEXT NOT NULL,
  "prefix"     TEXT NOT NULL,
  "last4"      TEXT NOT NULL,
  "createdById" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hashedKey_key" ON "api_keys" ("hashedKey");
CREATE INDEX IF NOT EXISTS "api_keys_userId_idx" ON "api_keys" ("userId");


-- team_members — mirror of Clerk Organization memberships (Teams v1)
CREATE TABLE IF NOT EXISTS "team_members" (
  "id"                TEXT NOT NULL,
  "workspaceId"       TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "role"              TEXT NOT NULL DEFAULT 'member',
  "clerkMembershipId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_clerkMembershipId_key" ON "team_members" ("clerkMembershipId");
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_workspaceId_userId_key" ON "team_members" ("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "team_members_userId_idx" ON "team_members" ("userId");

-- entities — a business in the CRM (discovered, enriched, operated on by agents)
CREATE TABLE IF NOT EXISTS "entities" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "domain"      TEXT,
  "website"     TEXT,
  "industry"    TEXT,
  "location"    TEXT,
  "description" TEXT,
  "size"        TEXT,
  "status"      "EntityStatus" NOT NULL DEFAULT 'NEW',
  "source"      TEXT,
  "tags"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes"       TEXT,
  "sharedFromId" TEXT,
  "enrichment"  JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "entities_userId_idx" ON "entities" ("userId");
CREATE INDEX IF NOT EXISTS "entities_userId_status_idx" ON "entities" ("userId", "status");

-- contacts — a person/company in the CRM, optionally under an entity
CREATE TABLE IF NOT EXISTS "contacts" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "entityId"   TEXT,
  "name"       TEXT,
  "email"      TEXT,
  "phone"      TEXT,
  "company"    TEXT,
  "title"      TEXT,
  "website"    TEXT,
  "linkedin"   TEXT,
  "facebook"   TEXT,
  "instagram"  TEXT,
  "twitter"    TEXT,
  "sharedFromId" TEXT,
  "location"   TEXT,
  "status"     "ContactStatus" NOT NULL DEFAULT 'NEW',
  "source"     TEXT,
  "tags"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes"      TEXT,
  "enrichment" JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contacts_userId_idx" ON "contacts" ("userId");
CREATE INDEX IF NOT EXISTS "contacts_userId_status_idx" ON "contacts" ("userId", "status");
CREATE INDEX IF NOT EXISTS "contacts_entityId_idx" ON "contacts" ("entityId");

-- contact_emails — email exchanged with a contact (rendered from AgentMail)
CREATE TABLE IF NOT EXISTS "contact_emails" (
  "id"                 TEXT NOT NULL,
  "contactId"          TEXT NOT NULL,
  "agentMailMessageId" TEXT,
  "agentMailThreadId"  TEXT,
  "direction"          "Emaildirection" NOT NULL,
  "fromAddr"           TEXT,
  "toAddr"             TEXT,
  "subject"            TEXT,
  "body"               TEXT,
  "savedAsContext"     BOOLEAN NOT NULL DEFAULT false,
  "sentAt"             TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_emails_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contact_emails_contactId_idx" ON "contact_emails" ("contactId");
CREATE INDEX IF NOT EXISTS "contact_emails_agentMailThreadId_idx" ON "contact_emails" ("agentMailThreadId");

-- contact_social_messages — social media messages (DMs, comments) with a contact
CREATE TABLE IF NOT EXISTS "contact_social_messages" (
  "id"             TEXT NOT NULL,
  "contactId"      TEXT NOT NULL,
  "channel"        "SocialChannel" NOT NULL,
  "direction"      "SocialDirection" NOT NULL,
  "body"           TEXT NOT NULL,
  "threadRef"      TEXT,
  "savedAsContext" BOOLEAN NOT NULL DEFAULT false,
  "sentAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_social_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contact_social_messages_contactId_createdAt_idx"
  ON "contact_social_messages" ("contactId", "createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Foreign keys
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "entities" ADD CONSTRAINT "entities_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_emails" ADD CONSTRAINT "contact_emails_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "team_members" ADD CONSTRAINT "team_members_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_social_messages" ADD CONSTRAINT "contact_social_messages_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- field_provenance - Moment 3 (Visible Trust): one row per enriched field,
-- recording who supplied it, confidence, value snapshot, and freshness.
CREATE TABLE IF NOT EXISTS "field_provenance" (
  "id"            TEXT NOT NULL,
  "recordType"    TEXT NOT NULL,
  "recordId"      TEXT NOT NULL,
  "field"         TEXT NOT NULL,
  "source"        TEXT NOT NULL,
  "confidence"    INTEGER NOT NULL DEFAULT 80,
  "valueSnapshot" TEXT,
  "retrievedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt"    TIMESTAMP(3),
  "stale"         BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "field_provenance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "field_provenance_recordType_recordId_field_key"
  ON "field_provenance" ("recordType", "recordId", "field");
CREATE INDEX IF NOT EXISTS "field_provenance_recordType_recordId_idx"
  ON "field_provenance" ("recordType", "recordId");
CREATE INDEX IF NOT EXISTS "field_provenance_retrievedAt_idx"
  ON "field_provenance" ("retrievedAt");
CREATE INDEX IF NOT EXISTS "field_provenance_stale_idx"
  ON "field_provenance" ("stale");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. Voice-native CRM (0014): additive columns on users for inbound voice.
--     voiceEnabled is the opt-in; voiceInboundSecret is the high-entropy
--     per-user token that authenticates an inbound AgentPhone call (baked
--     into the webhook URL the operator pastes into AgentPhone, as ?key=).
--     ADD COLUMN IF NOT EXISTS is safe to re-run and safe against the
--     pre-existing users table (this file's base CREATE TABLE for "users"
--     predates several later columns - plan/credits/agentPhoneApiKey/etc -
--     that already live only as app-level Prisma migrations; this statement
--     follows the same additive pattern for the new voice columns without
--     attempting to reconcile that earlier drift).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "voiceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "voiceInboundSecret" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_voiceInboundSecret_key" ON "users" ("voiceInboundSecret");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vector similarity index for memory recall. WITHOUT this, every agent turn
--    does a full sequential scan of the user's memory_chunks and degrades
--    linearly as data grows. `prisma db push` does NOT create this (it is raw
--    pgvector SQL, not in schema.prisma), so RUN IT ON SUPABASE.
--
--    HNSW (preferred over ivfflat): higher recall, needs no training/list
--    tuning, and handles ongoing inserts gracefully (ivfflat lists degrade as
--    the table grows and must be rebuilt). recallMemory() orders by the cosine
--    operator (embedding <=> query), so the index uses vector_cosine_ops.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "memory_chunks_embedding_hnsw_idx"
  ON "memory_chunks" USING hnsw ("embedding" vector_cosine_ops);
-- Legacy ivfflat index (kept for older DBs; harmless if both exist). Once the
-- HNSW index above is present you can DROP INDEX "memory_chunks_embedding_idx".
CREATE INDEX IF NOT EXISTS "memory_chunks_embedding_idx"
  ON "memory_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
