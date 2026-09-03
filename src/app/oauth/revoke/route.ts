import { checkRateLimit } from "@/lib/rate-limit";
import { revokeByPresentedToken } from "@/lib/oauth-server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

/**
 * Token revocation (RFC 7009). Takes client_id and token as
 * application/x-www-form-urlencoded, revokes the token and everything issued
 * alongside it, and answers 200 with an empty body whether or not the token
 * existed. An unknown token must never become an oracle, and a disconnect must
 * never fail because it already happened.
 */
export async function POST(req: Request) {
  const ok = new Response(null, { status: 200, headers: cors });

  if (!(await checkRateLimit(`oauth-revoke:${clientIp(req)}`, 120, 60_000)).success) {
    return Response.json({ error: "slow_down" }, { status: 429, headers: { ...cors, "Retry-After": "60" } });
  }

  let form: URLSearchParams;
  try {
    const fd = await req.formData();
    form = new URLSearchParams();
    for (const [key, value] of fd.entries()) form.set(key, String(value));
  } catch {
    return ok;
  }

  const token = form.get("token");
  if (!token) return ok;
  await revokeByPresentedToken(token, form.get("client_id"));
  return ok;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
