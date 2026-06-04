import { NextResponse } from "next/server";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth-utils";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    const userInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, user.id))
      .limit(50);

    return NextResponse.json(userInvoices);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("Invoices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}
