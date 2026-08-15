import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { OpError } from "@/lib/crm-operations";
import {
  createNativeWorkspace,
  listUserWorkspaces,
  workspaceQuota,
} from "@/lib/workspace";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

// GET /api/workspaces - the human's workspaces + quota (always the actor).
export async function GET() {
  try {
    const ctx = await getAuthContext();
    const [workspaces, quota] = await Promise.all([
      listUserWorkspaces(ctx.actor.id),
      workspaceQuota(ctx.actor),
    ]);
    const homeName = [ctx.actor.firstName, ctx.actor.lastName].filter(Boolean).join(" ") || "Home";
    return NextResponse.json({
      home: { name: homeName, id: ctx.actor.id },
      workspaces,
      quota: {
        used: quota.used,
        allowed: quota.unlimited ? null : quota.allowed,
        unlimited: quota.unlimited,
      },
      activeId: ctx.account.accountType === "workspace" ? ctx.account.id : null,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Failed to list workspaces" }, { status: 500 });
  }
}

// POST /api/workspaces - create a Scalar-native workspace for another business.
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const rate = await checkRateLimit(`workspace-create:${ctx.actor.id}`, 10, 60_000);
    if (!rate.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const workspace = await createNativeWorkspace(ctx.actor, parsed.data.name);
    return NextResponse.json(
      {
        workspace: {
          workspaceId: workspace.id,
          name: workspace.firstName,
          role: "admin",
          clerkId: workspace.clerkId,
          native: true,
          plan: workspace.plan,
          creditsRemaining: workspace.creditsRemaining,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/workspaces", e);
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }
}
