# Company OS

Scalar's company OS follows [opencompany](https://github.com/useopencompany/opencompany):
a typed API, a durable runner, and live CRM reads. Jev does not generate the
overview. It sits inside write turns as **warden packs** (openwork).

## Reads

`GET /api/company-os/overview` returns deterministic Prisma aggregates for the
signed-in workspace: entity/contact counts, follow-ups due, pending breakup
drafts, active autopilot plans, recent activity.

`GET /.well-known/company-os-app` advertises the OS surface to connectors.

## Wardens

Packs in `src/lib/company-os/warden.ts`:

- `pii-review`
- `quote-accuracy`
- `crm-schema`
- `outbound-tone`
- `permission-scope`

A pack is a noul. Code blocks when probability >= 0.75. Presentation never
asks Jev to invent the next sentence.
