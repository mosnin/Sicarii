import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import { findContactSocials } from "@/lib/social-find";

// POST /api/contacts/[id]/find-socials - search the web for the contact's
// social profiles. Verified matches (name AND company) are saved; the rest come
// back as candidates for review. Same op the MCP find_socials tool uses.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const rate = await checkRateLimit(`find-socials:${user.id}`, 20, 60_000);
    if (!rate.success) {
      return NextResponse.json(
        { error: "Rate limit reached. Please wait a moment and try again." },
        { status: 429 },
      );
    }
    const result = await findContactSocials(user.id, id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/contacts/[id]/find-socials", e);
    return NextResponse.json({ error: "Failed to find socials" }, { status: 500 });
  }
}
