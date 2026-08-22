#!/usr/bin/env node
// MCP smoke test: prove the live server honors list limits.
//
// Usage:
//   SCALAR_API_KEY=scl_... node scripts/mcp-smoke.mjs [url]
//   SCALAR_API_KEY=scl_... pnpm smoke:mcp
//
// Defaults to the production MCP endpoint. Calls tools/list, then
// list_entities with {limit: 1} and list_contacts with {limit: 1}, and FAILS
// if more than one row comes back. Never prints the key.

const url = process.argv[2] || process.env.SCALAR_MCP_URL || "https://www.tryscalar.xyz/api/mcp/mcp";
const key = process.env.SCALAR_API_KEY;
if (!key) {
  console.error("Set SCALAR_API_KEY (a Scalar API key from Settings). It is never printed.");
  process.exit(2);
}

let nextId = 1;
async function rpc(method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const text = await res.text();
  // Streamable HTTP may answer as plain JSON or as an SSE frame; handle both.
  const payload = text.trimStart().startsWith("{")
    ? text
    : text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
  const msg = JSON.parse(payload);
  if (msg.error) throw new Error(`${method}: ${JSON.stringify(msg.error)}`);
  return msg.result;
}

function rowsFromToolResult(result) {
  const text = result?.content?.[0]?.text ?? "[]";
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [];
}

const failures = [];
try {
  await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "scalar-smoke", version: "1.0.0" },
  });

  const tools = await rpc("tools/list", {});
  console.log(`tools/list: ${tools.tools.length} tools`);

  for (const tool of ["list_entities", "list_contacts"]) {
    const result = await rpc("tools/call", { name: tool, arguments: { limit: 1 } });
    const rows = rowsFromToolResult(result);
    const verdict = rows.length <= 1 ? "PASS" : "FAIL";
    console.log(`${tool} {limit: 1}: ${rows.length} row(s) -> ${verdict}`);
    if (rows.length > 1) failures.push(`${tool} returned ${rows.length} rows for limit 1`);
  }

  // The search alias must filter (a no-match probe returns nothing).
  const probe = await rpc("tools/call", {
    name: "list_contacts",
    arguments: { search: "__smoke_no_match__", limit: 5 },
  });
  const probeRows = rowsFromToolResult(probe);
  const verdict = probeRows.length === 0 ? "PASS" : "FAIL";
  console.log(`list_contacts {search: no-match}: ${probeRows.length} row(s) -> ${verdict}`);
  if (probeRows.length !== 0) failures.push(`search alias did not filter (${probeRows.length} rows)`);
} catch (e) {
  failures.push(String(e?.message ?? e));
}

if (failures.length > 0) {
  console.error(`\nSMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nSMOKE PASSED");
