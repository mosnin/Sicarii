#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const VERSION = "0.1.0";
const DEFAULT_ORIGIN = "https://www.tryscalar.xyz";
const KEYCHAIN_SERVICE = "xyz.tryscalar.cli.oauth";
const MCP_SCOPES = "openid profile mcp";

export function normalizeOrigin(value = DEFAULT_ORIGIN) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Scalar origin must use HTTPS, except for localhost development");
  }
  return url.origin;
}

export function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function run(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ["pipe", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${program} exited with ${code}`));
    });
    if (options.input) child.stdin?.end(options.input);
    else child.stdin?.end();
  });
}

function keychainAccount(origin) {
  return new URL(origin).host;
}

export async function loadCredentials(origin) {
  if (process.platform !== "darwin") {
    throw new Error("Persistent OAuth login currently requires macOS Keychain. Use SCALAR_API_KEY on this platform.");
  }
  try {
    const raw = await run("/usr/bin/security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      keychainAccount(origin),
      "-w",
    ]);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveCredentials(origin, credentials) {
  if (process.platform !== "darwin") throw new Error("OAuth credentials require macOS Keychain");
  await run(
    "/usr/bin/security",
    ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", keychainAccount(origin), "-w"],
    { input: JSON.stringify(credentials) + "\n" },
  );
}

export async function deleteCredentials(origin) {
  if (process.platform !== "darwin") return;
  await run("/usr/bin/security", [
    "delete-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    keychainAccount(origin),
  ]).catch(() => {});
}

async function revokeCredentials(origin) {
  const credentials = await loadCredentials(origin);
  if (!credentials) return;
  const form = new URLSearchParams({ client_id: credentials.clientId, token: credentials.refreshToken });
  const response = await fetch(`${origin}/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!response.ok) throw new Error("Scalar could not confirm remote token revocation. Credentials were kept so logout can be retried.");
}

async function openBrowser(url) {
  const command = process.platform === "darwin" ? "/usr/bin/open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

async function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not bind the OAuth callback"));
      resolve({ server, port: address.port });
    });
    server.on("error", reject);
  });
}

async function login(origin) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const initial = await startCallbackServer();
  const redirectUri = `http://127.0.0.1:${initial.port}/callback`;
  const resource = `${origin}/api/mcp/mcp`;
  const registration = await jsonFetch(`${origin}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Scalar CLI", redirect_uris: [redirectUri], scope: MCP_SCOPES }),
  });
  const authorization = new URL("/oauth/authorize", origin);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("client_id", registration.client_id);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("scope", MCP_SCOPES);
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", pkceChallenge(verifier));
  authorization.searchParams.set("code_challenge_method", "S256");
  authorization.searchParams.set("resource", resource);

  process.stderr.write("Opening Scalar in your browser...\n");
  await openBrowser(authorization.toString());
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      initial.server.close();
      reject(new Error("Login timed out after five minutes"));
    }, 5 * 60_000);
    initial.server.removeAllListeners("request");
    initial.server.on("request", (req, res) => {
      const callback = new URL(req.url || "/", redirectUri);
      const callbackState = callback.searchParams.get("state");
      const callbackCode = callback.searchParams.get("code");
      const error = callback.searchParams.get("error");
      if (callback.pathname !== "/callback" || callbackState !== state) {
        res.writeHead(400, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
        res.end("Scalar login rejected this callback. You can close this tab.");
        return;
      }
      clearTimeout(timer);
      res.writeHead(error || !callbackCode ? 400 : 200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      res.end(error ? `Scalar login failed: ${error}` : "Scalar CLI is connected. You can close this tab.");
      initial.server.close();
      if (error || !callbackCode) reject(new Error(callback.searchParams.get("error_description") || error || "Missing code"));
      else resolve(callbackCode);
    });
  });

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    resource,
  });
  const tokens = await jsonFetch(`${origin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  await saveCredentials(origin, {
    clientId: registration.client_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    resource,
    scope: tokens.scope,
  });
  process.stdout.write("Scalar CLI login complete. Credentials are stored in macOS Keychain.\n");
}

async function oauthAccessToken(origin) {
  if (process.env.SCALAR_API_KEY) return process.env.SCALAR_API_KEY;
  const credentials = await loadCredentials(origin);
  if (!credentials) throw new Error("Not logged in. Run: scalar login");
  if (credentials.expiresAt > Date.now() + 60_000) return credentials.accessToken;
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
    client_id: credentials.clientId,
    resource: credentials.resource,
  });
  const tokens = await jsonFetch(`${origin}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const rotated = {
    ...credentials,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
  };
  await saveCredentials(origin, rotated);
  return rotated.accessToken;
}

async function remoteClient(origin) {
  const token = await oauthAccessToken(origin);
  const client = new Client({ name: "scalar-cli", version: VERSION }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL("/api/mcp/mcp", origin), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, transport };
}

async function serveMcp(origin) {
  const remote = await remoteClient(origin);
  const server = new Server(
    { name: "scalar", version: VERSION },
    {
      capabilities: { tools: { listChanged: false } },
      instructions: "Secure local bridge to the user's canonical Scalar workspace.",
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => remote.client.listTools());
  server.setRequestHandler(CallToolRequestSchema, async (request) => remote.client.callTool(request.params));
  const stdio = new StdioServerTransport();
  const close = async () => {
    await remote.transport.close().catch(() => {});
    await server.close().catch(() => {});
  };
  process.on("SIGINT", () => void close().finally(() => process.exit(0)));
  process.on("SIGTERM", () => void close().finally(() => process.exit(0)));
  await server.connect(stdio);
}

async function listTools(origin) {
  const remote = await remoteClient(origin);
  try {
    const result = await remote.client.listTools();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await remote.transport.close();
  }
}

async function callTool(origin, name, raw) {
  if (!name) throw new Error("Usage: scalar call <tool-name> [json-arguments]");
  const args = raw ? JSON.parse(raw) : {};
  const remote = await remoteClient(origin);
  try {
    const result = await remote.client.callTool({ name, arguments: args });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await remote.transport.close();
  }
}

function help() {
  process.stdout.write(`Scalar CLI ${VERSION}\n\nCommands:\n  login                 Sign in through your browser with OAuth PKCE\n  logout                Remove Scalar credentials from macOS Keychain\n  status                Verify the saved connection\n  tools                 List agent tools as JSON\n  call NAME [JSON]      Call a Scalar tool\n  mcp serve             Expose Scalar as a local stdio MCP server\n\nOptions:\n  --origin URL          Scalar server, defaults to ${DEFAULT_ORIGIN}\n\nHeadless agents may set SCALAR_API_KEY instead of using OAuth.\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const originIndex = args.indexOf("--origin");
  const origin = normalizeOrigin(originIndex >= 0 ? args.splice(originIndex, 2)[1] : process.env.SCALAR_ORIGIN);
  const [command, subcommand, third] = args;
  if (!command || ["help", "--help", "-h"].includes(command)) return help();
  if (["--version", "-v"].includes(command)) return process.stdout.write(`${VERSION}\n`);
  if (command === "login") return login(origin);
  if (command === "logout") {
    await revokeCredentials(origin);
    await deleteCredentials(origin);
    return process.stdout.write("Scalar access was revoked and local credentials were removed.\n");
  }
  if (command === "status") {
    const remote = await remoteClient(origin);
    try {
      await remote.client.ping();
      return process.stdout.write(`Connected to ${origin}\n`);
    } finally {
      await remote.transport.close();
    }
  }
  if (command === "tools") return listTools(origin);
  if (command === "call") return callTool(origin, subcommand, third);
  if (command === "mcp" && subcommand === "serve") return serveMcp(origin);
  throw new Error(`Unknown command: ${args.join(" ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Scalar CLI: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
