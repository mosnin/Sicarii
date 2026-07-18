-- FOUNDER ACTION: run this against production BEFORE merging the PR that adds
-- @@unique([userId, email]) to the Contact model (prisma/schema.prisma).
--
-- Read-only. Reports duplicates; changes nothing. Once the unique index below
-- exists (via `prisma db push`), any (userId, email) pair with more than one
-- row will make that push fail with a unique-violation error - so this needs
-- to come back empty, or every group it lists needs to be resolved by hand,
-- before the schema change can land safely.
--
-- Why report-only and not an automated merge: a contact has FK fan-out into
-- contact_emails, contact_calls, contact_social_messages, contact_segments,
-- pipeline_entries, activities, and field_provenance (keyed by recordId, not
-- a real FK, so it needs its own reassignment). Silently picking a "keeper"
-- and reassigning/deleting the rest risks dropping a real conversation
-- history or, worse, merging two DIFFERENT people who happen to share a
-- work email (e.g. a shared "sales@company.com" inbox) into one contact -
-- which is exactly the kind of wrong-person mixing the product's accuracy
-- rule (CLAUDE.md: never attach data for the wrong person) exists to
-- prevent. That call needs a human looking at the actual names/companies on
-- each row, not a script guessing. This script only tells you where to look.
--
-- Suggested resolution once you have a group: open the contacts in the
-- Scalar UI. If they're really the same person (duplicate created by a
-- race or a re-import), keep the older one, copy over anything useful from
-- the newer one's notes/tags, and delete the newer one. If they're
-- genuinely two different people sharing one inbox, change one of them to
-- their real personal email (or blank it) so the constraint no longer
-- applies to that row.

-- 1. Exact duplicates: same userId + same email (what the new unique index
--    will actually enforce). Any row here blocks the migration.
SELECT
  "userId",
  "email",
  COUNT(*)                                    AS duplicate_count,
  ARRAY_AGG("id" ORDER BY "createdAt" ASC)     AS contact_ids_oldest_first,
  ARRAY_AGG("name" ORDER BY "createdAt" ASC)   AS names,
  ARRAY_AGG("company" ORDER BY "createdAt" ASC) AS companies
FROM "contacts"
WHERE "email" IS NOT NULL
GROUP BY "userId", "email"
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2. Advisory only (NOT blocking, the new index will NOT catch these):
--    same userId, email differs only by case ("Foo@x.com" vs "foo@x.com").
--    The app already treats these as the same contact when comparing
--    (see share.ts, mode: "insensitive"), but the raw DB constraint is
--    case-sensitive, so these can still exist side by side after the
--    migration. Worth a look, not required before merging.
SELECT
  "userId",
  LOWER("email")                             AS normalized_email,
  COUNT(*)                                   AS duplicate_count,
  ARRAY_AGG("id" ORDER BY "createdAt" ASC)   AS contact_ids_oldest_first,
  ARRAY_AGG("email" ORDER BY "createdAt" ASC) AS raw_emails
FROM "contacts"
WHERE "email" IS NOT NULL
GROUP BY "userId", LOWER("email")
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
