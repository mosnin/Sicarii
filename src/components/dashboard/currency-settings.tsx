"use client";

/**
 * CurrencySettings - the reporting currency every total is denominated in,
 * and the manual rates those totals rest on.
 *
 * Two honesty rules show up in this UI. Changing the reporting currency
 * re-rates OPEN deals only and says how many closed ones stayed booked where
 * they were, because restating history is how a number stops reconciling.
 * And any deal whose currency has no rate is named here rather than folded
 * into a total as a zero.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COMMON = [
  "USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "SEK", "NOK", "DKK",
  "SGD", "HKD", "NZD", "INR", "BRL", "MXN", "ZAR", "AED", "PLN", "ILS",
];

interface RateRow {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  asOf: string;
  source: "MANUAL" | "FETCHED";
  provider: string | null;
}

interface CurrencyState {
  reportingCurrency: string;
  currenciesInUse: string[];
  missingRatesFor: string[];
  rates: RateRow[];
  totals: {
    total: string;
    totalFormatted: string;
    counted: number;
    unconverted: number;
    disclosure: string | null;
  };
}

export function CurrencySettings({ initialBase }: { initialBase: string }) {
  const [state, setState] = useState<CurrencyState | null>(null);
  const [base, setBase] = useState(initialBase);
  const [busy, setBusy] = useState<"base" | "rate" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [quote, setQuote] = useState("");
  const [rate, setRate] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/currency");
      if (!res.ok) return;
      const data: CurrencyState = await res.json();
      setState(data);
      setBase(data.reportingCurrency);
    } catch {
      // A failed refresh leaves the last known state on screen, which is
      // better than blanking the numbers the operator was reading.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveBase(next: string) {
    setBusy("base");
    setErr(null);
    setNote(null);
    try {
      const res = await fetch("/api/currency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportingCurrency: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? "Couldn't change the reporting currency.");
        return;
      }
      const rerated = data.rerated?.converted ?? 0;
      const closed = data.rerated?.closedLeftAlone ?? 0;
      setNote(
        `Now reporting in ${data.reportingCurrency}. ${rerated} open deal${rerated === 1 ? "" : "s"} re-rated` +
          (closed
            ? `, ${closed} closed deal${closed === 1 ? "" : "s"} left booked in ${data.previous} (history is not restated, so they are excluded from totals until you say otherwise).`
            : "."),
      );
      await load();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function addRate() {
    setBusy("rate");
    setErr(null);
    setNote(null);
    try {
      const res = await fetch("/api/currency/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteCurrency: quote, rate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error ?? "Couldn't save that rate.");
        return;
      }
      const filled = data.filled?.converted ?? 0;
      setNote(filled ? `Rate saved. ${filled} deal${filled === 1 ? "" : "s"} joined your totals.` : "Rate saved.");
      setQuote("");
      setRate("");
      await load();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function removeRate(row: RateRow) {
    setBusy("rate");
    setErr(null);
    setNote(null);
    try {
      const res = await fetch(
        `/api/currency/rates?base=${encodeURIComponent(row.baseCurrency)}&quote=${encodeURIComponent(row.quoteCurrency)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data?.error ?? "Couldn't remove that rate.");
        return;
      }
      await load();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  const manualRates = state?.rates.filter((r) => r.source === "MANUAL") ?? [];

  return (
    <div className="space-y-6">
      {/* Reporting currency */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Reporting currency</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every total, chart and sort is denominated in this. Deals keep the
            currency the customer pays in; the converted figure is frozen at the
            rate on the day it was written, so a closed quarter never moves.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={base}
            onChange={(e) => setBase(e.target.value)}
            aria-label="Reporting currency"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {[...new Set([base, ...COMMON])].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <Button
            onClick={() => saveBase(base)}
            disabled={busy !== null || base === state?.reportingCurrency}
          >
            {busy === "base" ? "Re-rating..." : "Save"}
          </Button>
        </div>
        {state && (
          <p className="text-sm text-muted-foreground">
            Open and closed deals total{" "}
            <span className="font-medium text-foreground">{state.totals.totalFormatted}</span> across{" "}
            {state.totals.counted} deal{state.totals.counted === 1 ? "" : "s"}.
            {state.totals.disclosure ? ` ${state.totals.disclosure}` : ""}
          </p>
        )}
      </div>

      {/* Manual rates */}
      <div className="space-y-3 border-t border-border pt-5">
        <div>
          <p className="text-sm font-medium text-foreground">Exchange rates</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            One unit of the deal currency is worth this much in {state?.reportingCurrency ?? base}.
            A rate you set here wins over any fetched one. A deal in a currency
            with no rate is left out of every total and counted separately,
            never treated as zero.
          </p>
        </div>

        {state && state.missingRatesFor.length > 0 && (
          <p className="text-sm text-destructive">
            No rate into {state.reportingCurrency} for: {state.missingRatesFor.join(", ")}. Deals in
            those currencies are not in your totals.
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={quote}
            placeholder="EUR"
            aria-label="Deal currency"
            maxLength={3}
            onChange={(e) => setQuote(e.target.value.toUpperCase())}
            className="sm:w-28 font-mono"
          />
          <Input
            value={rate}
            placeholder="1.08"
            aria-label={`Value of one unit in ${state?.reportingCurrency ?? base}`}
            inputMode="decimal"
            onChange={(e) => setRate(e.target.value)}
            className="sm:w-40 font-mono"
          />
          <Button onClick={addRate} disabled={busy !== null || !quote.trim() || !rate.trim()}>
            {busy === "rate" ? "Saving..." : "Set rate"}
          </Button>
        </div>

        {manualRates.length > 0 && (
          <div className="divide-y divide-border">
            {manualRates.map((row) => (
              <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono">
                  1 {row.quoteCurrency} = {row.rate} {row.baseCurrency}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    set {new Date(row.asOf).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeRate(row)}
                    disabled={busy !== null}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {note && <p className="text-sm font-medium text-primary">{note}</p>}
      {err && <p className="text-sm font-medium text-destructive">{err}</p>}
    </div>
  );
}
