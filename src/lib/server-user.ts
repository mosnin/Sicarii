import type { User } from "@prisma/client";
import { getOptionalAuthContext } from "@/lib/auth-utils";

export async function getDbUser(): Promise<User | null> {
  return (await getOptionalAuthContext())?.account ?? null;
}
