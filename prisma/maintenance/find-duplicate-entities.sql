-- FOUNDER ACTION: run this against production BEFORE merging the PR that adds
-- @@unique([userId, domain]) to the Entity model (prisma/schema.prisma).
--
-- Read-only. Reports duplicates; changes nothing. Once the unique index below
-- exists (via `prisma db push`), any (userId, domain) pair with more than one
-- row will make that push fail with a unique-violation error - so this needs
-- to come back empty, or every group it lists needs to be resolved by hand,
-- before the schema change can land safely.
--
-- Why report-only and not an automated merge: merging two entities means
-- reassigning every FK that points at the loser row (contacts.entityId,
-- activities.entityId, and the entity's own FieldProvenance rows keyed by
-- recordId) onto the keeper, then deleting the loser - and picking the wrong
-- "keeper" (e.g. the one with less complete data) silently discards real
-- work. That decision deserves a human looking at the actual rows, not a
-- script guessing. This script only tells you where to look.
--
-- Suggested resolution once you have a group: open both companies in the
-- Scalar UI, move any contacts on the row you're keeping fewer of, then
-- delete the extra entity row. For domain typos/case variants that aren't
-- true duplicates (e.g. "Acme Inc" vs "Acme Corp" that both resolve to
-- acme.com on purpose), decide by hand whether they should really be one
-- company or the domain on one of them is wrong.

-- 1. Exact duplicates: same userId + same domain (what the new unique index
--    will actually enforce). Any row here blocks the migration.
SELECT
  "userId",
  "domain",
  COUNT(*)                                   AS duplicate_count,
  ARRAY_AGG("id" ORDER BY "createdAt" ASC)    AS entity_ids_oldest_first,
  ARRAY_AGG("name" ORDER BY "createdAt" ASC)  AS names
FROM "entities"
WHERE "domain" IS NOT NULL
GROUP BY "userId", "domain"
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2. Advisory only (NOT blocking, the new index will NOT catch these):
--    same userId, domain differs only by case or a "www." prefix. The
--    app-level dedup check in findCompanies/discoverLocalLeads normalizes
--    this way before comparing, but the raw DB constraint is case-sensitive
--    and does not strip "www.", so these can still exist side by side after
--    the migration. Worth a look, not required before merging.
SELECT
  "userId",
  LOWER(REGEXP_REPLACE("domain", '^www\.', '')) AS normalized_domain,
  COUNT(*)                                      AS duplicate_count,
  ARRAY_AGG("id" ORDER BY "createdAt" ASC)       AS entity_ids_oldest_first,
  ARRAY_AGG("domain" ORDER BY "createdAt" ASC)   AS raw_domains
FROM "entities"
WHERE "domain" IS NOT NULL
GROUP BY "userId", LOWER(REGEXP_REPLACE("domain", '^www\.', ''))
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
