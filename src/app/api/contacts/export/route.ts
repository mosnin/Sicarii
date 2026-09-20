import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { toCsv } from "@/lib/csv";

const COLUMNS = [
  "name",
  "email",
  "phone",
  "company",
  "title",
  "website",
  "linkedin",
  "twitter",
  "instagram",
  "facebook",
  "location",
  "status",
  "source",
  "tags",
  "notes",
  "entity_name",
  "createdAt",
];

// GET /api/contacts/export - download all the user's contacts as CSV.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    const rate = await checkRateLimit(`export:${user.id}`, 5, 60_000);
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const contacts = await prisma.contact.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        name: true,
        email: true,
        phone: true,
        company: true,
        title: true,
        website: true,
        linkedin: true,
        twitter: true,
        instagram: true,
        facebook: true,
        location: true,
        status: true,
        source: true,
        tags: true,
        notes: true,
        createdAt: true,
        entity: { select: { name: true } },
      },
    });

    const rows = contacts.map(({ entity, tags, ...rest }) => ({
      ...rest,
      tags: tags.join(";"),
      entity_name: entity?.name ?? "",
    }));

    const csv = toCsv(rows, COLUMNS);
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="scalar-contacts-${date}.csv"`,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/contacts/export", e);
    return NextResponse.json({ error: "Failed to export contacts" }, { status: 500 });
  }
}
