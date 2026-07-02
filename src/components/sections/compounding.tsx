"use client";

/**
 * CompoundingSection - the core promise as a picture: a database that gets
 * more valuable with every agent run. Single-series line chart (validated
 * chart-1 token: #2E7DB3 light / #3E96D6 dark, 3:1+ on both surfaces) with
 * crosshair tooltip, plus metric tiles for the shape of a working account.
 * The data is an ILLUSTRATIVE product view, labeled as such, never a claim.
 */

import Grid from "@/components/charts/grid";
import LineChart, { Line } from "@/components/charts/line-chart";
import { ChartTooltip } from "@/components/charts/tooltip";
import { Metric, MetricLabel, MetricValue } from "@/components/metric";
import Border2 from "@/components/pixel-perfect/border2";

// Deterministic illustrative curve: compounding record growth over 30 days.
// Fixed dates so server and client render identically.
const SERIES = Array.from({ length: 30 }, (_, i) => {
  const day = String(i + 1).padStart(2, "0");
  return {
    date: `2026-06-${day}`,
    records: Math.round(42 * Math.pow(1.085, i) + i * 4),
  };
});

const LAST = SERIES[SERIES.length - 1].records;

export function CompoundingSection() {
  return (
    <section className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">The compounding</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            Every run makes the next one sharper
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Records in, dedupe on the way, provenance on every field. This is what a
            month of agent work looks like when nothing rots.
          </p>
        </div>

        <div className="relative mx-auto mt-12 max-w-4xl rounded-2xl border border-border bg-card/40 p-4 sm:p-6">
          <Border2 />
          <div className="flex items-baseline justify-between gap-4 px-2">
            <p className="font-brand text-sm text-foreground">CRM records, 30 days</p>
            <p className="text-xs text-muted-foreground">Illustrative view</p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {[
              { label: "Companies", value: "312" },
              { label: "Contacts", value: "1,148" },
              { label: "Fields verified", value: "6,940" },
              { label: "Radar signals", value: "87" },
            ].map((m) => (
              <Metric key={m.label} className="bg-card px-4 py-3">
                <MetricLabel className="text-xs text-muted-foreground">{m.label}</MetricLabel>
                <MetricValue className="font-brand text-xl tabular-nums text-foreground">
                  {m.value}
                </MetricValue>
              </Metric>
            ))}
          </dl>

          <div className="mt-6">
            <LineChart
              data={SERIES}
              className="md:aspect-3/1!"
              margin={{ top: 16, right: 32, bottom: 36, left: 40 }}
            >
              <Grid horizontal />
              <Line dataKey="records" stroke="var(--chart-1)" strokeWidth={2} />
              <ChartTooltip />
            </LineChart>
          </div>

          <p className="mt-3 px-2 text-right text-xs text-muted-foreground">
            Day 30: {LAST.toLocaleString("en-US")} records, all yours, all exportable.
          </p>
        </div>
      </div>
    </section>
  );
}
