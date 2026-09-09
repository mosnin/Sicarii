import { checkRateLimit } from "@/lib/rate-limit";
import { scalarPublicOrigin } from "@/lib/company-os-overview";
import { createDeviceAuthorization } from "@/lib/oauth-server";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

export async function POST(req: Request) {
  if (!(await checkRateLimit(`oauth-device-code:${clientIp(req)}`, 20, 60 * 60_000)).success) {
    return Response.json({ error: "slow_down" }, { status: 429, headers: { ...headers, "Retry-After": "3600" } });
  }
  return Response.json(await createDeviceAuthorization(scalarPublicOrigin(req)), { status: 201, headers });
}
