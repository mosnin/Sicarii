// Away-window guarantee: when a user finishes the first run and sets an ICP,
// seed ONE recurring Radar (intent monitor) from that ICP so their agent keeps
// working while they're away - which is what makes The Pulse fire reliably on
// the next session instead of being a coin-flip.
//
// Guardrails (this auto-spends, so it is bounded on purpose):
//   - Idempotent: only seeds if the user has NO monitors yet (never piles on,
//     never double-creates).
//   - Provider-gated: no EXA key -> no monitor (nothing to run).
//   - Credit-capped by construction: every monitor run debits `monitor_run` via
//     spendCredits (see radar-run.ts), which throws + skips when the balance
//     can't cover it. So a free account's radar simply stops when credits run
//     out - it can never overspend.
//   - Weekly cadence keeps the ongoing cost low; the FIRST run is scheduled a
//     few hours out so there's fresh away-window activity by the user's next
//     visit (the Pulse needs a delta since last-seen).
//   - Fully toggleable: it is a normal monitor, so pause/delete in Radar. It is
//     named so the user knows it is the auto one.

import { prisma } from "@/lib/prisma";
import { isExaConfigured } from "@/lib/exa";

const FIRST_RUN_DELAY_HOURS = 3;
const MIN_ICP_LENGTH = 8; // shorter than this is too vague to monitor usefully

/**
 * Create a weekly ICP radar for the user if one is warranted. Returns true when
 * a monitor was created. Never throws - away-window seeding must never fail the
 * first-run flow.
 */
export async function maybeSeedIcpRadar(userId: string, icp: string): Promise<boolean> {
  try {
    const query = icp.trim();
    if (query.length < MIN_ICP_LENGTH) return false;
    if (!isExaConfigured()) return false;

    // Idempotent: don't create a second one, and don't touch users who already
    // run their own monitors.
    const existing = await prisma.intentMonitor.count({ where: { userId } });
    if (existing > 0) return false;

    // First run soon (so the Pulse has something by the next visit), then weekly.
    // Inngest reschedules to +7d after each run (see runIntentMonitors).
    const nextRunAt = new Date(Date.now() + FIRST_RUN_DELAY_HOURS * 60 * 60 * 1000);

    // Local monitor only: the Inngest poller runs it on nextRunAt without needing
    // an Exa-registered webhook, so we skip the network round-trip here to keep
    // the first-run flow fast.
    await prisma.intentMonitor.create({
      data: {
        userId,
        name: `ICP radar: ${query.slice(0, 48)}`,
        query: query.slice(0, 2000),
        frequency: "weekly",
        autoAdd: true,
        active: true,
        nextRunAt,
      },
    });
    return true;
  } catch (e) {
    console.warn("[radar-seed] failed to seed ICP radar", e);
    return false;
  }
}
