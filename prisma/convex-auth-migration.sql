-- Runs before db push. A fresh database has no users table yet, so this block
-- deliberately does nothing there. On an existing deployment it applies only
-- the safe additive auth changes before Prisma evaluates schema drift.
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT 'convex-auth';
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "authSubject" TEXT;
    ALTER TABLE "users" ALTER COLUMN "clerkId" DROP NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "users_authSubject_key" ON "users" ("authSubject");
  END IF;
END $$;

-- Existing accounts are linked only after Convex Auth returns the same verified
-- email. Keep clerkId during the rollback window, then remove it separately.
