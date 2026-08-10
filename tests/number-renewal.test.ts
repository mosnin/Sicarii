// A phone number costs the carrier every month. handleNumberRenewal charges
// the monthly rent and advances the renewal date; on insufficient credits it
// grants grace instead of releasing a working number.
import { describe, it, expect, vi, beforeEach } from "vitest";

const num: Record<string, unknown> = {};
let paySucceeds = true;
const spent: { amount: number; label: string }[] = [];
const updates: Record<string, unknown>[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findUnique: async () => ({ ...num }),
      // The claim: advance nextRenewalAt only if still due. Returns count 1 when
      // the row is due, 0 when it was already advanced (redelivery/concurrent).
      updateMany: async ({ where, data }: { where: { nextRenewalAt?: { lte: Date } }; data: Record<string, unknown> }) => {
        const due = !num.nextRenewalAt || (num.nextRenewalAt as Date) <= (where.nextRenewalAt?.lte ?? new Date());
        if (!due) return { count: 0 };
        Object.assign(num, data);
        updates.push(data);
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(num, data);
        updates.push(data);
        return { ...num };
      },
    },
  },
}));
vi.mock("@/lib/credits", () => ({
  spendCreditsAmount: async (_u: string, amount: number, label: string) => {
    spent.push({ amount, label });
    return paySucceeds;
  },
}));
vi.mock("@/lib/tasks", () => ({ enqueueTask: vi.fn() }));

import { handleNumberRenewal } from "@/lib/telephony/renewal";

beforeEach(() => {
  spent.length = 0;
  updates.length = 0;
  paySucceeds = true;
  Object.assign(num, {
    id: "n1",
    userId: "u1",
    e164: "+14155551234",
    status: "ACTIVE",
    monthlyCostCents: 100,
    nextRenewalAt: new Date(Date.now() - 1000), // due
  });
});

describe("handleNumberRenewal", () => {
  it("charges the monthly cost in credits and pushes the renewal 30 days out", async () => {
    const r = await handleNumberRenewal("n1");
    expect(spent).toEqual([{ amount: 100, label: "phone_number_renewal" }]);
    const next = num.nextRenewalAt as Date;
    expect(next.getTime()).toBeGreaterThan(Date.now() + 25 * 24 * 60 * 60 * 1000);
    expect(r.outcome).toContain("Charged 100 credits");
  });

  it("grants grace (does not release) when the tenant is out of credits", async () => {
    paySucceeds = false;
    const r = await handleNumberRenewal("n1");
    expect(num.status).toBe("ACTIVE"); // NOT released
    const next = num.nextRenewalAt as Date;
    expect(next.getTime()).toBeLessThan(Date.now() + 5 * 24 * 60 * 60 * 1000); // short grace, not 30d
    expect(r.outcome).toContain("grace");
  });

  it("does not charge an inactive number", async () => {
    num.status = "RELEASED";
    const r = await handleNumberRenewal("n1");
    expect(spent).toHaveLength(0);
    expect(r.outcome).toContain("not active");
  });

  it("does not double-charge a redelivery whose renewal was already advanced", async () => {
    num.nextRenewalAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // already renewed
    const r = await handleNumberRenewal("n1");
    expect(spent).toHaveLength(0);
    expect(r.outcome).toContain("Already renewed");
  });
});
