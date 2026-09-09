import { checkRateLimit } from "@/lib/rate-limit";
import { exchangeDeviceAuthorization } from "@/lib/oauth-server";

const headers = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

export async function POST(req: Request) {
  if (!(await checkRateLimit(`oauth-device-token:${clientIp(req)}`, 120, 60_000)).success) {
    return Response.json({ error: "slow_down" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  }
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "invalid_request" }, { status: 400, headers });
  const result = await exchangeDeviceAuthorization(String(form.get("device_code") ?? ""));
  if (result.ok) return Response.json(result.tokens, { headers });
  return Response.json({ error: result.error }, { status: result.status, headers });
}
