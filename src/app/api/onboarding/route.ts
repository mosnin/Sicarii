import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, onboardingSubmissions, projectPhases } from "@/db/schema";
import { projectPhaseNames } from "@/lib/services";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const onboardingSchema = z.object({
  businessName: z.string().min(1).max(255),
  industry: z.string().max(255).optional(),
  website: z.string().url().max(2048).optional().or(z.literal("")),
  description: z.string().max(5000).optional(),
  targetAudience: z.string().max(2000).optional(),
  timeline: z.string().max(100).optional(),
  budget: z.string().max(100).optional(),
  additionalNotes: z.string().max(5000).optional(),
  brandColors: z.string().max(500).optional(),
  features: z.array(z.string().max(255)).max(50).optional(),
  serviceType: z.enum([
    "web_application",
    "ecommerce_store",
    "funnels",
    "ai_automation",
    "open_claw_deployment",
  ]),
});

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();

    const rateLimit = checkRateLimit(user.id + ":onboarding", 5);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const body = await req.json();
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const {
      serviceType,
      businessName,
      industry,
      website,
      description,
      targetAudience,
      timeline,
      budget,
      brandColors,
      additionalNotes,
    } = parsed.data;

    // Create project
    const [project] = await db
      .insert(projects)
      .values({
        userId: user.id,
        name: businessName,
        serviceType,
        status: "onboarding",
      })
      .returning();

    // Create onboarding submission
    await db.insert(onboardingSubmissions).values({
      projectId: project.id,
      businessName,
      industry,
      website,
      description,
      targetAudience,
      timeline,
      budget,
      brandColors,
      additionalNotes,
    });

    // Create default phases (batch insert)
    await db.insert(projectPhases).values(
      projectPhaseNames.map((name, i) => ({
        projectId: project.id,
        name,
        order: i,
        status: "pending" as const,
      }))
    );

    return NextResponse.json({ projectId: project.id });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
