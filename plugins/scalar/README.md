# Scalar plugin for Claude Code

Scalar is the CRM your agents run. This plugin bundles five Scalar skills and
connects Scalar's remote MCP server so Claude can read and write every record:
discover leads, enrich accurately, keep the CRM clean, schedule intent monitors,
and operate the whole thing over MCP.

## What's inside

- Skills (model-invoked, namespaced as `/scalar:<name>`):
  - `scalar-discover` - find companies and people and add them to the CRM, deduped.
  - `scalar-enrich` - add firmographics, tech stack, funding, and verified contact
    info, without ever attaching the wrong record.
  - `scalar-link-contacts` - link people to companies, dedupe, bulk-enrich.
  - `scalar-intent-monitors` - schedule recurring intent scans and deep research.
  - `scalar-mcp-agent` - drive Scalar's CRM from an external agent via MCP.
- MCP server: Scalar's remote Streamable HTTP server at
  `https://www.tryscalar.xyz/api/mcp/mcp`, declared in the plugin manifest. It
  starts automatically when the plugin is enabled and exposes Scalar's tools
  (entities, contacts, emails, discovery, enrichment) to Claude.

## Install

This repo doubles as a plugin marketplace (see `.claude-plugin/marketplace.json`
at the repo root). Add the marketplace, then install the plugin.

From GitHub (replace `owner/repo` with this repository):

```
/plugin marketplace add owner/repo
/plugin install scalar@scalar-marketplace
```

From a local clone of this repo:

```
/plugin marketplace add ./
/plugin install scalar@scalar-marketplace
```

Or test the plugin directly without a marketplace:

```
claude --plugin-dir ./plugins/scalar
```

After installing, run `/reload-plugins` (or restart) to load the skills and MCP
server. The skills appear under the `/scalar:` namespace.

## Authentication (required for the MCP server)

Scalar's MCP server supports two auth methods on the same URL:

1. OAuth (for clients that do the browser flow, e.g. Claude's custom connector).
   You sign in to Scalar to authorize; no key needed.
2. API key as a Bearer token (for key-based / headless agents like openclaw,
   Hermes, and this plugin's default config).

This plugin's manifest passes `Authorization: Bearer ${SCALAR_API_KEY}`. Create a
key in Scalar Settings -> API keys, then export it before launching Claude Code:

```
export SCALAR_API_KEY=scl_your_key_here
```

If you'd rather use OAuth, remove the `headers` block from the plugin's
`mcpServers` config and authenticate via `/mcp`. Until authenticated, the skills
still load but MCP tool calls will be unauthorized.

## Notes

- Hard accuracy rule (Scalar): enrichment must never attach data for the wrong
  person or company. Verify name AND company/domain before saving; prefer null and
  "couldn't find it" over a wrong value.
- One company per domain. Deduplicate before creating records.
