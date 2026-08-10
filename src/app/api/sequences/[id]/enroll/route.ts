// Enroll a contact into a sequence.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { OpError } from "@/lib/op-error";
import { enrollContact } from "@/lib/sequences";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await params;
    const { contactId } = z.object({ contactId: z.string().min(1) }).parse(await req.json());
    return NextResponse.json(await enrollContact(user.id, id, contactId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 });
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[sequences] enroll", e);
    return NextResponse.json({ error: "Failed to enroll" }, { status: 500 });
  }
}
