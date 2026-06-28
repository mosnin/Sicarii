// POST /api/welcome
// Streams Server-Sent Events for the Moment 1 "first run" performance.
// Accepts { icp: string } in the request body; streams WelcomeEvent objects
// as SSE until done. Hard-capped at 10 finds / 3 enrichments / once per user.
//
// The run is unmetered (free to the user) - this is the onboarding demo, not
// usage. Per 0006-the-four-moments.md: "the demo is free (unmetered,
// hard-capped) - it is marketing, not usage."
//
// Uses the Web Streams API (ReadableStream) which is how Next.js 16 route
// handlers do streaming - not the old Response.stream() from older versions.

export const maxDuration = 90;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-utils";
import {
  runWelcomeOrchestration,
  hasCompletedFirstRun,
  type WelcomeEvent,
} from "@/lib/welcome-orchestrator";

// Encode one SSE event into the wire format.
function sseEvent(event: WelcomeEvent): Uint8Array {
  const data = JSON.stringify(event);
  const line = `data: ${data}\n\n`;
  return new TextEncoder().encode(line);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    const body = (await req.json().catch(() => null)) as { icp?: string } | null;
    const icp = body?.icp?.trim();

    if (!icp || icp.length < 3) {
      return NextResponse.json(
        { error: "Please describe who you sell to (at least a few words)." },
        { status: 400 },
      );
    }
    if (icp.length > 500) {
      return NextResponse.json(
        { error: "Description is too long - keep it to one sentence." },
        { status: 400 },
      );
    }

    // The orchestrator runs inside a ReadableStream so events are streamed
    // incrementally as they happen. The stream controller enqueues each SSE
    // chunk; the browser EventSource reads them as they arrive.
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: WelcomeEvent) => {
          try {
            controller.enqueue(sseEvent(event));
          } catch {
            // Stream was closed (client disconnected) - swallow silently.
          }
        };

        try {
          await runWelcomeOrchestration(user.id, icp, emit);
        } catch (err) {
          console.error("[api/welcome] orchestration error", err);
          emit({
            type: "error",
            message:
              "Something went wrong during setup. Your CRM is ready - your agent will populate it when you connect.",
          });
          emit({
            type: "done",
            message: "Your CRM is ready.",
            total: 0,
            enriched: 0,
            hasNews: 0,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    // getAuthenticatedUser throws a NextResponse 401 on no session.
    if (err instanceof NextResponse) return err;
    console.error("[api/welcome] unexpected error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

// GET /api/welcome - check whether this user has already completed the first
// run. Used by the /welcome page to decide whether to redirect to /dashboard.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const completed = await hasCompletedFirstRun(user.id);
    return NextResponse.json({ completed });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[api/welcome] GET error", err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 },
    );
  }
}
