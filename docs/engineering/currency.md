# Money in Scalar: deal amounts, currencies and rates

_Status: shipped, 2026-08-07. Owner: the engineer + the producer._

A CRM that reports a number it cannot defend is worse than a CRM with no
numbers at all. Everything below is a rule about deal money, and each one is
written next to the specific wrong number it prevents. None of them is a
style preference.

Code: [`src/lib/currency.ts`](../../src/lib/currency.ts) (codes and rates),
[`src/lib/conversion.ts`](../../src/lib/conversion.ts) (the discipline around
the columns), [`src/lib/mcp/deal-tools.ts`](../../src/lib/mcp/deal-tools.ts)
(the agent surface), tests in [`tests/currency.test.ts`](../../tests/currency.test.ts).

## The columns

`PipelineEntry` carries six money columns plus an expected close date.

| Column | What it is |
|---|---|
| `amount`, `currency` | What the customer pays, in the currency they pay in |
| `baseAmount`, `baseCurrency` | The same value converted into the operator's reporting currency |
| `fxRate`, `fxRateAt` | The rate used for that conversion, and when it was true |

`User.reportingCurrency` is per user. Two tenants report in two different
currencies, so every aggregate is computed against the caller's own base, never
a global constant.

## The rules

**1. `amount` + `currency` is what the customer pays, and is never converted in
place.** The moment you overwrite it, you have lost the only figure that
matches the contract, the invoice and the customer's memory of the
conversation. Conversion is additive: it writes new columns, it never edits
these two.

**2. `baseAmount` is the only column a total, chart, average, sort or forecast
may touch.** Summing `amount` across rows adds euros to dollars and prints a
confident wrong number. Sorting on `amount` ranks a 900,000 JPY deal above a
50,000 USD one. `moneyTotals()` and `dealsByValue()` are the only sanctioned
readers, and both key on `baseAmount`.

**3. `baseCurrency` is written by every writer of `baseAmount`, in the same
statement.** Without it, a figure converted against a base that has since
changed is indistinguishable from a correct one: you get a column of numbers
with no way to tell which denomination each is in. `dealFields()` returns all
four columns together for exactly this reason, so a caller cannot write one
without the others.

**4. The rate is resolved once and frozen.** Converting on read makes a closed
quarter change value every morning, and a number that moves after the fact
cannot be reconciled against an invoice. `fxRate`/`fxRateAt` record what was
true at write time. A rate is re-resolved only when `amount` or `currency`
actually changes, and the unchanged one is read back off the row in the same
call, so changing only the currency of a 5,000 deal re-rates 5,000 rather than
nulling it. `moneyUpdate()` returns `null` when neither moved, which is how a
stage change is prevented from silently re-pricing a deal.

**5. A missing rate is a NULL, disclosed, never zeroed.** Defaulting to 1 says
a euro is a dollar. Defaulting to 0 deletes the deal. A null falls out of
`_sum` automatically, so the sum stays correct, but the deal is now invisible:
that is why every total is returned with the COUNT of rows it could not
include, and a ready-made sentence like "3 deals in CHF are not included". A
total without its exclusions is a wrong number wearing a confident face.

**6. The "needs conversion" filter matches NULL explicitly.** In SQL, and
therefore in Prisma, `{ not: base }` does not match a NULL column. The obvious
query for "rows not converted into my base" is exactly blind to the rows that
were never converted at all. `pendingWhere()` is written as an explicit
`OR: [{ baseCurrency: null }, { baseCurrency: { not: base } }, { baseAmount: null }]`,
and `tests/currency.test.ts` proves both that the naive filter misses a null
row and that this one catches it.

**7. Filters compose with AND, never object spread.** `pendingWhere()` contains
an `OR`, and callers have `OR` clauses of their own. `{ ...a, ...b }` keeps
only the last `OR` key, which silently drops half the condition, and the
result is a filter that reports fully converted deals as pending. Use
`andWhere(...)`. There is a test for this too.

**8. Currency codes are validated against a real ISO-4217 list.**
`z.string().length(3)` happily accepts "ZZZ" and books a deal in a currency no
rate will ever exist for. `normalizeCurrency()` upper-cases, trims and checks
membership. `XXX` ("no currency") and `XTS` ("testing") are excluded on
purpose even though ISO defines them.

**9. Codes are deduplicated case-insensitively.** Currency arrives as free text
from imports, humans and agents, so `" usd "` and `"USD"` both reach the
table. A re-rate pass that does not normalise first resolves the same currency
twice and can freeze two different rates in one run.

**10. MANUAL beats FETCHED.** The unique key is
`[userId, baseCurrency, quoteCurrency, source]`, so both can exist for a pair
and the operator's number always wins. This is what makes a rate-fetching integration
optional rather than required: with no provider wired up at all, a manual rate
is a complete answer. A rate of zero or less is refused on write AND ignored
on read, so one bad row cannot zero a total.

Rates may also be resolved by inverting the opposite row (`1/r`, rounded to the
column's 10 decimal places), so an operator who entered USD from EUR does not
have to re-enter EUR from USD when they switch reporting currency. Direct rows
always win over inverted ones.

**Direction, stated once:** a row (`baseCurrency` = B, `quoteCurrency` = Q,
`rate` = r) means one unit of Q is worth r units of B, so
`baseAmount = amount * r`.

**12. Rates are per tenant, like everything else.** `ExchangeRate.userId` is
required and part of the unique key, and every read and write of the table is
scoped to it: `resolveRate`, `resolveRates`, `upsertManualRate`,
`deleteManualRate`, `listRatesForBase`. A MANUAL rate is one operator's
judgement about their own book. Shared across accounts, one operator
correcting their EUR rate would silently restate every other operator's
pipeline, and one operator deleting a rate would remove everyone's. FETCHED
rates are written per tenant too: a nullable "global" `userId` would not
dedupe, because Postgres treats NULLs as distinct in a unique index, so the
table would accumulate duplicate rows for the same pair. Rates are a handful
of rows per account, so the duplication buys unambiguous ownership cheaply.
`tests/currency.test.ts` has a named block for this ("rates are per tenant"),
including that a cross-tenant delete is a 404.

**11. All arithmetic is `Prisma.Decimal` (decimal.js).** Money never becomes a
JS number. `0.1 + 0.2` is not `0.3`, and a forecast that is off by a cent is a
forecast nobody trusts. The only float in the money path is inside
`formatMoney`, converting a value that has already been rounded into a string
for a human to read, from which nothing is derived.

## Changing the reporting currency

`PATCH /api/currency` is the only thing in the codebase that overwrites a
frozen rate, and it re-rates **open deals only**.

A WON deal is booked revenue: it was worth what it was worth on the day it
closed, at the rate that was true then. Re-rating it restates history, and a
number that moves after the fact cannot be reconciled against an invoice.
LOST deals are history for the same reason. Open deals have not been booked,
so restating them in the currency the operator now reports in is simply the
current expectation of the same future cash, which is the honest figure.

The consequence is deliberate, and it is surfaced rather than hidden: after a
currency change, closed deals still carry their old `baseCurrency`, so they
drop out of totals in the new base and are counted in `unconverted`. Excluded
and disclosed beats silently summed in the wrong denomination. The settings
surface says so in words ("N closed deals left booked in USD") the moment the
change is made.

## Known debts

- **`amount` is `Decimal(14,2)`.** Currencies with three minor units (KWD,
  BHD, TND) round to two on the way in.
- **No rate provider is wired up.** `RateSource.FETCHED` is honoured on read
  but nothing writes it yet. Manual rates cover the gap completely, which is
  why the integration is optional. When one is added it must write a row per
  tenant, by design: see rule 12 for why a shared row is not an option.
- **The outreach variant bandit still optimises reply rate**
  (`src/lib/variant-bandit.ts`). Now that deals carry real value, the honest
  objective is revenue per send, not replies per send. Owed, not done.
