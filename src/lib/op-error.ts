// The shared operational error for the CRM ops layer and everything built on
// top of it (crm-operations.ts, field-operations.ts, variant-operations.ts).
// Carries an HTTP-shaped status so REST routes, the MCP server, and the
// in-app agent can each turn it into the right response without re-deriving
// one from a message string.
//
// Lives in its own module (not crm-operations.ts) so variant-operations.ts
// can depend on it without creating a crm-operations <-> variant-operations
// import cycle - crm-operations.ts re-exports it from here so every existing
// `import { OpError } from "@/lib/crm-operations"` call site keeps working
// unchanged.
export class OpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OpError";
    this.status = status;
  }
}
