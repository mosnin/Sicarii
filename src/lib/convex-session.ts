import "server-only";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";

export interface ConvexSessionIdentity {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
}

export async function getConvexSessionIdentity(): Promise<ConvexSessionIdentity | null> {
  const token = await convexAuthNextjsToken();
  if (!token) return null;
  return fetchQuery(api.profile.current, {}, { token });
}
