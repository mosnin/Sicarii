import { Cmd, asciiBytes, utf8Bytes } from "@native-sdk/core";
import { type ThemeState } from "@native-sdk/core/events";
import { codecParseDeviceStart, codecParseOverview, codecParseToken } from "@native-sdk/services";
import type { DeviceStart, OverviewData, TokenBundle } from "./shared.ts";

export type Phase = "booting" | "signed_out" | "authorizing" | "waiting" | "loading" | "ready" | "failed";

export interface Model {
  readonly phase: Phase;
  readonly status: Uint8Array;
  readonly deviceCode: Uint8Array;
  readonly userCode: Uint8Array;
  readonly accountName: Uint8Array;
  readonly accountType: Uint8Array;
  readonly companies: number;
  readonly contacts: number;
  readonly enriched: number;
  readonly inConversation: number;
  readonly radarActive: number;
  readonly radarSignals: number;
  readonly replies: number;
  readonly dueFollowups: number;
  readonly toEnrich: number;
  readonly activityOne: Uint8Array;
  readonly activityTwo: Uint8Array;
  readonly activityThree: Uint8Array;
}

export type Msg =
  | { readonly kind: "sign_in" }
  | { readonly kind: "refresh" }
  | { readonly kind: "sign_out" }
  | { readonly kind: "open_dashboard" }
  | { readonly kind: "open_crm" }
  | { readonly kind: "open_radar" }
  | { readonly kind: "access_restored"; readonly secret: Uint8Array }
  | { readonly kind: "refresh_restored"; readonly secret: Uint8Array }
  | { readonly kind: "refresh_restored_for_revoke"; readonly secret: Uint8Array }
  | { readonly kind: "credential_failed"; readonly reason: Uint8Array }
  | { readonly kind: "credential_saved" }
  | { readonly kind: "credential_deleted" }
  | { readonly kind: "device_response"; readonly status: number; readonly body: Uint8Array }
  | { readonly kind: "device_parsed"; readonly result: DeviceStart }
  | { readonly kind: "service_failed"; readonly reason: Uint8Array }
  | { readonly kind: "poll_due"; readonly at: number }
  | { readonly kind: "token_response"; readonly status: number; readonly body: Uint8Array }
  | { readonly kind: "refresh_response"; readonly status: number; readonly body: Uint8Array }
  | { readonly kind: "token_parsed"; readonly result: TokenBundle }
  | { readonly kind: "overview_response"; readonly status: number; readonly body: Uint8Array }
  | { readonly kind: "overview_parsed"; readonly result: OverviewData }
  | { readonly kind: "network_failed"; readonly reason: Uint8Array }
  | { readonly kind: "revoked"; readonly status: number; readonly body: Uint8Array };

export const viewUnbound = [
  "deviceCode",
  "access_restored",
  "refresh_restored",
  "refresh_restored_for_revoke",
  "credential_failed",
  "credential_saved",
  "credential_deleted",
  "device_response",
  "device_parsed",
  "service_failed",
  "poll_due",
  "token_response",
  "refresh_response",
  "token_parsed",
  "overview_response",
  "overview_parsed",
  "network_failed",
  "revoked",
] as const;

const DEVICE_URL = asciiBytes("https://www.tryscalar.xyz/oauth/device/code");
const DEVICE_TOKEN_URL = asciiBytes("https://www.tryscalar.xyz/oauth/device/token");
const TOKEN_URL = asciiBytes("https://www.tryscalar.xyz/oauth/token");
const REVOKE_URL = asciiBytes("https://www.tryscalar.xyz/oauth/revoke");
const OVERVIEW_URL = asciiBytes("https://www.tryscalar.xyz/api/client/v1/overview");
const DASHBOARD_URL = asciiBytes("https://www.tryscalar.xyz/dashboard");
const CRM_URL = asciiBytes("https://www.tryscalar.xyz/crm");
const RADAR_URL = asciiBytes("https://www.tryscalar.xyz/radar");

function blankModel(): Model {
  return {
    phase: "booting",
    status: utf8Bytes("Checking this Mac for a secure Scalar session..."),
    deviceCode: new Uint8Array(0),
    userCode: new Uint8Array(0),
    accountName: new Uint8Array(0),
    accountType: new Uint8Array(0),
    companies: 0,
    contacts: 0,
    enriched: 0,
    inConversation: 0,
    radarActive: 0,
    radarSignals: 0,
    replies: 0,
    dueFollowups: 0,
    toEnrich: 0,
    activityOne: utf8Bytes("No recent activity yet"),
    activityTwo: new Uint8Array(0),
    activityThree: new Uint8Array(0),
  };
}

function joinBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const output = new Uint8Array(left.length + right.length);
  for (let i = 0; i < left.length; i += 1) output[i] = left[i];
  for (let i = 0; i < right.length; i += 1) output[left.length + i] = right[i];
  return output;
}

function bearer(token: Uint8Array): Uint8Array {
  return joinBytes(asciiBytes("Bearer "), token);
}

function deviceForm(code: Uint8Array): Uint8Array {
  return joinBytes(asciiBytes("device_code="), code);
}

function refreshForm(token: Uint8Array): Uint8Array {
  return joinBytes(asciiBytes("grant_type=refresh_token&client_id=scalar_macos_native_v1&refresh_token="), token);
}

function revokeForm(token: Uint8Array): Uint8Array {
  return joinBytes(asciiBytes("client_id=scalar_macos_native_v1&token="), token);
}

export function initialModel(): [Model, Cmd<Msg>] {
  return [blankModel(), Cmd.credentials.get("access_token", { key: "restore-access", ok: "access_restored", err: "credential_failed" })];
}

export function themeState(_model: Model): ThemeState {
  return { pack: "geist", colorScheme: "system", accent: "#5ab0e8" };
}

export function update(model: Model, msg: Msg): Model | [Model, Cmd<Msg>] {
  switch (msg.kind) {
    case "sign_in":
      const authorizing = blankModel();
      return [
        { ...authorizing, phase: "authorizing", status: utf8Bytes("Starting secure browser sign-in...") },
        Cmd.fetch(
          { url: DEVICE_URL, method: "POST", headers: { accept: "application/json" }, timeoutMs: 15000 },
          { key: "device-start", ok: "device_response", err: "network_failed" },
        ),
      ];
    case "device_response":
      const deviceStatus = msg.status / 1;
      if (deviceStatus !== 201) return { ...model, phase: "failed", status: utf8Bytes("Scalar could not start sign-in.") };
      return [model, codecParseDeviceStart({ body: msg.body }, { key: "parse-device", ok: "device_parsed", err: "service_failed" })];
    case "device_parsed":
      return [
        {
          ...model,
          phase: "waiting",
          status: utf8Bytes("Approve access in your browser. This window updates automatically."),
          deviceCode: msg.result.deviceCode,
          userCode: msg.result.userCode,
        },
        Cmd.batch([Cmd.openExternalUrl(msg.result.verificationUrl), Cmd.delay("device-poll", 5000, "poll_due")]),
      ];
    case "poll_due":
      if (model.phase !== "waiting") return model;
      return [
        model,
        Cmd.fetch(
          {
            url: DEVICE_TOKEN_URL,
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
            body: deviceForm(model.deviceCode),
            timeoutMs: 15000,
          },
          { key: "device-token", ok: "token_response", err: "network_failed" },
        ),
      ];
    case "token_response":
      const tokenStatus = msg.status / 1;
      if (tokenStatus === 428) return [model, Cmd.delay("device-poll", 5000, "poll_due")];
      if (tokenStatus !== 200) return { ...model, phase: "failed", status: utf8Bytes("Sign-in was denied or expired. Try again.") };
      return [model, codecParseToken({ body: msg.body }, { key: "parse-token", ok: "token_parsed", err: "service_failed" })];
    case "refresh_response":
      const refreshStatus = msg.status / 1;
      if (refreshStatus !== 200) {
        const signedOut = blankModel();
        return [
          { ...signedOut, phase: "signed_out", status: utf8Bytes("Your session expired. Sign in again.") },
          Cmd.batch([
            Cmd.credentials.delete("access_token", { key: "delete-access-expired", ok: "credential_deleted", err: "credential_failed" }),
            Cmd.credentials.delete("refresh_token", { key: "delete-refresh-expired", ok: "credential_deleted", err: "credential_failed" }),
          ]),
        ];
      }
      return [model, codecParseToken({ body: msg.body }, { key: "parse-refresh", ok: "token_parsed", err: "service_failed" })];
    case "token_parsed":
      return [
        { ...model, phase: "loading", status: utf8Bytes("Loading your live Scalar workspace..."), deviceCode: new Uint8Array(0) },
        Cmd.batch([
          Cmd.credentials.set("access_token", msg.result.accessToken, { key: "save-access", ok: "credential_saved", err: "credential_failed" }),
          Cmd.credentials.set("refresh_token", msg.result.refreshToken, { key: "save-refresh", ok: "credential_saved", err: "credential_failed" }),
          Cmd.fetch(
            {
              url: OVERVIEW_URL,
              method: "GET",
              headers: { authorization: bearer(msg.result.accessToken), accept: "application/json" },
              timeoutMs: 15000,
            },
            { key: "overview", ok: "overview_response", err: "network_failed" },
          ),
        ]),
      ];
    case "access_restored":
      return [
        { ...model, phase: "loading", status: utf8Bytes("Loading your live Scalar workspace...") },
        Cmd.fetch(
          {
            url: OVERVIEW_URL,
            method: "GET",
            headers: { authorization: bearer(msg.secret), accept: "application/json" },
            timeoutMs: 15000,
          },
          { key: "overview", ok: "overview_response", err: "network_failed" },
        ),
      ];
    case "overview_response":
      const overviewStatus = msg.status / 1;
      if (overviewStatus === 401) {
        return [
          { ...model, phase: "loading", status: utf8Bytes("Refreshing your secure session...") },
          Cmd.credentials.get("refresh_token", { key: "restore-refresh", ok: "refresh_restored", err: "credential_failed" }),
        ];
      }
      if (overviewStatus !== 200) return { ...model, phase: "failed", status: utf8Bytes("Scalar could not load this workspace.") };
      return [model, codecParseOverview({ body: msg.body }, { key: "parse-overview", ok: "overview_parsed", err: "service_failed" })];
    case "overview_parsed":
      return {
        ...model,
        phase: "ready",
        status: utf8Bytes("Live and synced with Scalar"),
        accountName: msg.result.accountName,
        accountType: msg.result.accountType,
        companies: msg.result.companies,
        contacts: msg.result.contacts,
        enriched: msg.result.enriched,
        inConversation: msg.result.inConversation,
        radarActive: msg.result.radarActive,
        radarSignals: msg.result.radarSignals,
        replies: msg.result.replies,
        dueFollowups: msg.result.dueFollowups,
        toEnrich: msg.result.toEnrich,
        activityOne: msg.result.activityOne,
        activityTwo: msg.result.activityTwo,
        activityThree: msg.result.activityThree,
      };
    case "refresh":
      return [
        { ...model, phase: "loading", status: utf8Bytes("Refreshing from Scalar...") },
        Cmd.credentials.get("access_token", { key: "refresh-access", ok: "access_restored", err: "credential_failed" }),
      ];
    case "refresh_restored":
      return [
        model,
        Cmd.fetch(
          {
            url: TOKEN_URL,
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
            body: refreshForm(msg.secret),
            timeoutMs: 15000,
          },
          { key: "refresh-token", ok: "refresh_response", err: "network_failed" },
        ),
      ];
    case "sign_out":
      const cleared = blankModel();
      return [
        { ...cleared, phase: "signed_out", status: utf8Bytes("Signed out securely") },
        Cmd.credentials.get("refresh_token", { key: "revoke-refresh", ok: "refresh_restored_for_revoke", err: "credential_failed" }),
      ];
    case "refresh_restored_for_revoke":
      return [
        model,
        Cmd.batch([
          Cmd.fetch(
            {
              url: REVOKE_URL,
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: revokeForm(msg.secret),
              timeoutMs: 15000,
            },
            { key: "revoke", ok: "revoked", err: "network_failed" },
          ),
          Cmd.credentials.delete("access_token", { key: "delete-access", ok: "credential_deleted", err: "credential_failed" }),
          Cmd.credentials.delete("refresh_token", { key: "delete-refresh", ok: "credential_deleted", err: "credential_failed" }),
        ]),
      ];
    case "credential_failed":
      if (model.phase === "booting") return { ...model, phase: "signed_out", status: utf8Bytes("Sign in to sync this Mac with Scalar") };
      if (model.phase === "signed_out") return model;
      return { ...model, phase: "failed", status: utf8Bytes("macOS Keychain could not complete the secure session operation.") };
    case "service_failed":
      return { ...model, phase: "failed", status: utf8Bytes("Scalar returned data this app could not verify.") };
    case "network_failed":
      return { ...model, phase: "failed", status: utf8Bytes("Scalar is unreachable. Check your connection and try again.") };
    case "credential_saved":
    case "credential_deleted":
      return model;
    case "revoked":
      if (msg.status / 1 < 0) return model;
      return model;
    case "open_dashboard":
      return [model, Cmd.openExternalUrl(DASHBOARD_URL)];
    case "open_crm":
      return [model, Cmd.openExternalUrl(CRM_URL)];
    case "open_radar":
      return [model, Cmd.openExternalUrl(RADAR_URL)];
  }
}
