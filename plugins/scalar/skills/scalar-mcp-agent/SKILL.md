---
name: scalar-mcp-agent
description: Drive Scalar's CRM from an external agent via MCP and webhooks.
---

# Connect your agent (MCP)

Scalar is the CRM your agents run. Point your own agent at it over MCP.

## Setup
1. Create an API key in Settings.
2. Connect Scalar's MCP server in your agent using that key. Your agent can now
   read and write entities, contacts, emails, and run discovery/enrichment
   through the same operations the app uses.
3. To get notified when scheduled tasks finish, set the Agent notifications
   webhook in Settings; handle the POST in your agent.

## Guardrails (always)
- Confirm before sending email or other high-stakes actions.
- Never attach enrichment to the wrong person or company. Verify name and company
  first; prefer nothing over a wrong value.
- Deduplicate before creating records (one company per domain).
