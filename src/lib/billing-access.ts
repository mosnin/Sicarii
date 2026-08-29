// Workspace vs personal checkout policy. Kept pure so the Stripe route and
// webhook can share one decision, and so tests can lock the cases without
// standing up Clerk or Stripe.

export type CheckoutDecision =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Who may buy which plan.
 *
 * Personal accounts buy starter/pro/business.
 * Workspace accounts buy only the team plan, and only an org admin may start
 * that checkout. A member completing a personal-tier session would rewrite
 * the workspace plan and overwrite `stripeCustomerId`, orphaning the admin's
 * team subscription.
 */
export function checkoutAllowed(opts: {
  accountType: string;
  workspaceRole: string | null;
  plan: string;
}): CheckoutDecision {
  if (opts.accountType === "workspace") {
    if (opts.workspaceRole !== "admin") {
      return { ok: false, status: 403, error: "Only a team admin can manage the team plan." };
    }
    if (opts.plan !== "team") {
      return {
        ok: false,
        status: 400,
        error: "Team workspaces use the team plan. Switch to your personal account to buy a personal plan.",
      };
    }
    return { ok: true };
  }

  if (opts.plan === "team") {
    return {
      ok: false,
      status: 400,
      error: "Switch to your team workspace to buy the team plan.",
    };
  }
  return { ok: true };
}

/** Stripe webhook counterpart: refuse a completed session that would bind the
 *  wrong kind of plan to the account (defense in depth if a session was
 *  created before the checkout gate, or metadata was wrong). */
export function stripePlanAppliesToAccount(accountType: string, plan: string): boolean {
  if (accountType === "workspace") return plan === "team";
  return plan !== "team";
}
