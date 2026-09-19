import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadCompanyOsOverview } from "@/lib/company-os";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const rate = await checkRateLimit(`company-os:${user.id}`, 30, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const overview = await loadCompanyOsOverview(user.id);
    return NextResponse.json(overview);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/company-os/overview", e);
    return NextResponse.json({ error: "Company OS overview failed." }, { status: 500 });
  }
}
