import type { DeviceStart, DeviceStartRequest, OverviewData, OverviewRequest, TokenBundle, TokenRequest } from "../shared.ts";
function bytes(value: unknown, field: string): Uint8Array {
  if (typeof value !== "string") throw { kind: "invalid_response", message: `Missing ${field}` };
  return Buffer.from(value, "utf8");
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw { kind: "invalid_response", message: `Missing ${field}` };
  return value;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw { kind: "invalid_response", message: `Missing ${field}` };
  return value as Record<string, unknown>;
}

function parse(body: Uint8Array): Record<string, unknown> {
  return object(JSON.parse(Buffer.from(body).toString("utf8")), "response");
}

export function parseDeviceStart(request: DeviceStartRequest): DeviceStart {
  const data = parse(request.body);
  return {
    deviceCode: bytes(data.device_code, "device_code"),
    userCode: bytes(data.user_code, "user_code"),
    verificationUrl: bytes(data.verification_uri_complete, "verification_uri_complete"),
  };
}

export function parseToken(request: TokenRequest): TokenBundle {
  const data = parse(request.body);
  return { accessToken: bytes(data.access_token, "access_token"), refreshToken: bytes(data.refresh_token, "refresh_token") };
}

function activitySummary(value: unknown, index: number): Uint8Array {
  if (!Array.isArray(value) || index >= value.length) return new Uint8Array(0);
  const item = object(value[index], "recent activity");
  const summary = typeof item.summary === "string" ? item.summary : "Activity updated";
  const target = item.target && typeof item.target === "object" && !Array.isArray(item.target)
    ? (item.target as Record<string, unknown>)
    : null;
  const name = target && typeof target.name === "string" ? target.name : "";
  return Buffer.from(name ? `${name}: ${summary}` : summary, "utf8");
}

export function parseOverview(request: OverviewRequest): OverviewData {
  const data = parse(request.body);
  const account = object(data.account, "account");
  const overview = object(data.overview, "overview");
  const metrics = object(overview.metrics, "metrics");
  const attention = object(overview.needsAttention, "needsAttention");
  const activity = overview.recentActivity;
  return {
    accountName: bytes(account.name, "account.name"),
    accountType: bytes(account.type, "account.type"),
    companies: number(metrics.companies, "companies"),
    contacts: number(metrics.contacts, "contacts"),
    enriched: number(metrics.enriched, "enriched"),
    inConversation: number(metrics.inConversation, "inConversation"),
    radarActive: number(metrics.radarActive, "radarActive"),
    radarSignals: number(metrics.radarSignalsLast7Days, "radarSignalsLast7Days"),
    replies: number(attention.replies, "replies"),
    dueFollowups: number(attention.dueFollowups, "dueFollowups"),
    toEnrich: number(attention.toEnrich, "toEnrich"),
    activityOne: activitySummary(activity, 0),
    activityTwo: activitySummary(activity, 1),
    activityThree: activitySummary(activity, 2),
  };
}
