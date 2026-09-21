import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/op-error";
import { addOwnedDomain, listDomains, searchDomainsForUser } from "@/lib/mailbox-operations";

function op(e: unknown) {
  if (e instanceof NextResponse) return e;
  if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("domains", e);
  return NextResponse.json({ error: "Domain request failed" }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const domains = await listDomains(user.id);
    return NextResponse.json({ domains });
  } catch (e) {
    return op(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`domains-write:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as {
      action?: string;
      name?: string;
      query?: string;
    } | null;

    if (body?.action === "search") {
      if (!body.query) return NextResponse.json({ error: "query is required." }, { status: 400 });
      const result = await searchDomainsForUser(body.query);
      return NextResponse.json(result);
    }

    if (body?.action === "add" || body?.name) {
      if (!body.name) return NextResponse.json({ error: "name is required." }, { status: 400 });
      const domain = await addOwnedDomain(user.id, body.name);
      return NextResponse.json({ domain }, { status: 201 });
    }

    return NextResponse.json({ error: "action must be search or add." }, { status: 400 });
  } catch (e) {
    return op(e);
  }
}
