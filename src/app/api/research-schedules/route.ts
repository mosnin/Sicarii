import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

// GET /api/research-schedules - list all schedules for the current user.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const schedules = await prisma.researchSchedule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ schedules });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("GET /api/research-schedules", e);
    return NextResponse.json({ error: "Failed to list schedules" }, { status: 500 });
  }
}

// POST /api/research-schedules - create a new scheduled research job.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const body = (await req.json().catch(() => null)) as {
      name?: string;
      query?: string;
      provider?: "linkup" | "exa";
      depth?: "standard" | "deep";
      frequency?: "hourly" | "daily" | "weekly";
      targetType?: "contact" | "entity";
      targetId?: string;
    } | null;

    if (!body?.name || !body?.query) {
      return NextResponse.json({ error: "name and query are required" }, { status: 400 });
    }

    const rate = checkRateLimit(`research-schedule:create:${user.id}`, 20, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    // A target must belong to the caller - never let a schedule reference another
    // user's entity/contact by id.
    if (body.targetId) {
      const owned =
        body.targetType === "contact"
          ? await prisma.contact.findFirst({ where: { id: body.targetId, userId: user.id }, select: { id: true } })
          : body.targetType === "entity"
            ? await prisma.entity.findFirst({ where: { id: body.targetId, userId: user.id }, select: { id: true } })
            : null;
      if (!owned) {
        return NextResponse.json({ error: "Invalid target" }, { status: 400 });
      }
    }

    const now = new Date();
    const nextRunAt = new Date(now);
    const freq = body.frequency ?? "daily";
    if (freq === "weekly") nextRunAt.setDate(nextRunAt.getDate() + 7);
    else if (freq === "hourly") nextRunAt.setHours(nextRunAt.getHours() + 1);
    else nextRunAt.setDate(nextRunAt.getDate() + 1);

    const schedule = await prisma.researchSchedule.create({
      data: {
        userId: user.id,
        name: body.name,
        query: body.query,
        provider: body.provider ?? "linkup",
        depth: body.depth ?? "deep",
        frequency: freq,
        targetType: body.targetType,
        targetId: body.targetId,
        nextRunAt,
      },
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("POST /api/research-schedules", e);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}

// DELETE /api/research-schedules?id=xxx - delete a research schedule.
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const schedule = await prisma.researchSchedule.findUnique({ where: { id } });
    if (!schedule || schedule.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.researchSchedule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("DELETE /api/research-schedules", e);
    return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
  }
}
