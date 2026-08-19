// Shared id guards. Prisma UUID columns throw (P2023) on a non-uuid string,
// which would 500 a dashboard page if a query param or cookie was tampered.
// Reject those at the edge and treat them as missing.

// Format only. Postgres uuid accepts any 128-bit value; a strict RFC variant
// check would 404 real rows and still not stop P2023 on junk strings.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}
