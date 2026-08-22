import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";

/**
 * GET /api/discover/match?email=<>&domain=<>
 *
 * Returns the first exact-matching contact (by email) and/or entity (by domain)
 * scoped to the authenticated user. Used by the Discover UI to decide whether
 * to offer "Add to CRM" or "Update existing record".
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim().toLowerCase() || null;
    const domain = searchParams.get("domain")?.trim().toLowerCase() || null;

    const [contact, entity] = await Promise.all([
      email
        ? prisma.contact.findFirst({
            where: {
              userId: user.id,
              email: { equals: email, mode: "insensitive" },
            },
          })
        : Promise.resolve(null),
      domain
        ? prisma.entity.findFirst({
            where: {
              userId: user.id,
              domain: { equals: domain, mode: "insensitive" },
            },
          })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({ contact, entity });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/discover/match", e);
    return NextResponse.json({ error: "Match lookup failed" }, { status: 500 });
  }
}
