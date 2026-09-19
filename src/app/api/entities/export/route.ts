import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { toCsv } from "@/lib/csv";
import { OpError, listEntitiesExport } from "@/lib/crm-operations";

const COLUMNS = [
  "name",
  "domain",
  "website",
  "phone",
  "industry",
  "location",
  "size",
  "status",
  "source",
  "tags",
  "notes",
  "createdAt",
];

// GET /api/entities/export - download all the user's entities as CSV.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    const rate = await checkRateLimit(`export:${user.id}`, 5, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const entities = await listEntitiesExport(user.id);

    const rows = entities.map(({ tags, ...rest }) => ({
      ...rest,
      tags: tags.join(";"),
    }));

    const csv = toCsv(rows, COLUMNS);
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="scalar-entities-${date}.csv"`,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/entities/export", e);
    return NextResponse.json({ error: "Failed to export entities" }, { status: 500 });
  }
}
