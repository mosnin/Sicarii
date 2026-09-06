-- Run once against an existing Scalar database before deploying Convex Auth.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "authProvider" TEXT NOT NULL DEFAULT 'convex-auth';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "authSubject" TEXT;
ALTER TABLE "users" ALTER COLUMN "clerkId" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_authSubject_key" ON "users" ("authSubject");

-- Existing accounts are linked only after Convex Auth returns the same verified
-- email. Keep clerkId during the rollback window, then remove it separately.
