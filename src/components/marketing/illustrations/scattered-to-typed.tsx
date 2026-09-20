"use client";

/**
 * Structure, not scattered files. Forge UI `recordimport`, adapted.
 *
 * Vendor layout and card kept. Its full-colour Microsoft Excel mark is replaced
 * with a plain .md document in our own tokens, because the thing Scalar
 * replaces is a folder of markdown notes, not a spreadsheet. Its avatar pointed
 * at /pfp2.jpg, which is not in public/ and would 404 in production; initials
 * fix that and avoid inventing a photographed person.
 */

import React from "react";

import { FitScale } from "./fit-scale";

function MarkdownFile({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 60" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 4h26l14 14v38H4z"
        className="fill-muted stroke-border"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M30 4v14h14" className="stroke-border" strokeWidth="2" strokeLinejoin="round" />
      <rect x="11" y="27" width="26" height="3" rx="1.5" className="fill-muted-foreground/35" />
      <rect x="11" y="35" width="20" height="3" rx="1.5" className="fill-muted-foreground/25" />
      <rect x="11" y="43" width="23" height="3" rx="1.5" className="fill-muted-foreground/25" />
      <text
        x="24"
        y="18"
        textAnchor="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 9, fontFamily: "monospace" }}
      >
        .md
      </text>
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 370.353 370.353"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M368.432,166.578c-23.256-19.584-42.84-42.84-63.648-64.872c-11.016-11.628-28.151-34.884-46.512-36.108c-1.224-1.836-3.06-3.06-7.344-2.448c-2.448,0.612-4.284,2.448-4.896,4.896c-3.672,14.076-3.06,28.764-3.06,43.452c-53.856-7.344-116.893,19.584-159.732,48.348C36.115,191.057-0.605,243.078,0.007,301.217c0,2.448,1.836,3.672,3.672,4.284c1.836,1.836,4.284,2.448,6.732,1.224c70.992-50.184,145.044-94.247,235.009-78.947h0.611c-5.508,17.748-6.119,37.943-6.119,56.304c0,5.508,4.896,7.344,8.567,6.732c1.836,2.447,6.12,4.283,9.18,1.224c40.393-33.66,84.456-71.604,111.385-117.503C370.88,172.698,370.88,168.414,368.432,166.578z M348.235,183.102c-10.403,15.3-23.868,28.764-37.332,42.228c-18.359,18.36-39.168,34.272-56.916,53.244c0-16.524-0.611-33.048,0.612-50.185c0-1.836-0.612-3.06-1.836-3.672c1.836-3.672,1.224-8.567-3.672-9.792c-88.741-18.972-170.749,23.256-239.292,77.112c9.18-53.856,41.004-94.248,86.904-124.848s93.637-36.72,146.269-42.84v0.612c-0.612,4.896,7.344,5.508,8.568,1.224c0-1.224,0.611-1.836,0.611-3.06c3.672-1.836,4.896-6.732,1.836-8.568c1.836-9.792,2.448-19.584,3.672-29.376c0-1.836,0.612-4.896,1.225-7.956c7.956,10.404,21.42,19.584,30.6,28.764c17.748,18.36,34.272,37.944,52.632,56.304C351.907,170.862,356.191,170.862,348.235,183.102z" />
    </svg>
  );
}

const CARD = "border border-border bg-card shadow-sm";

const ROWS: [string, string][] = [
  ["Company", "Northwind Pay"],
  ["Email", "verified"],
  ["Stage", "Qualified"],
  ["Source", "Discover"],
];

export function ScatteredToTyped() {
  return (
    <FitScale width={480} height={368}>
      <div className="relative h-full w-full">
        <div
          className="absolute top-44 flex size-24 -translate-y-1/2 items-center justify-center"
          style={{ left: 40 }}
        >
          <MarkdownFile className="size-16" />
        </div>

        <ArrowIcon className="absolute top-1/2 left-32 size-9 -translate-y-1/2 text-muted-foreground/40" />

        <div
          className={`absolute overflow-hidden rounded-2xl ${CARD}`}
          style={{ left: 178, top: 20, width: 280, height: 320 }}
        >
          <div className="flex items-center gap-3 px-5 pt-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-medium text-primary">
              AC
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] text-foreground">
                Ava Chen
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Head of RevOps
              </p>
            </div>
          </div>

          <div className="mt-2 divide-y divide-black/5 px-5 dark:divide-white/8">
            {ROWS.map(([label, value]) => (
              <div
                key={label}
                className="flex h-11 items-center justify-between"
              >
                <span className="text-[12.5px] text-muted-foreground">
                  {label}
                </span>
                <span className="text-[12.5px] text-foreground">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 z-10 h-8 bg-[linear-gradient(to_top,var(--card),transparent)]"
          style={{ left: 178, width: 280 }}
        />
      </div>
    </FitScale>
  );
};

