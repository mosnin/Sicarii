"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatIn } from "@/components/ui/float-in";
import type { GeoEntity, Viewport } from "@/components/dashboard/entity-map";

// Leaflet touches window, so load the map client-only.
const EntityMap = dynamic(() => import("@/components/dashboard/entity-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>,
});

export default function EntityMapPage() {
  const [entities, setEntities] = useState<GeoEntity[]>([]);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);

  const loadGeo = useCallback(async () => {
    const d = await fetch("/api/entities/geo").then((r) => r.json()).catch(() => ({}));
    setEntities(d.entities ?? []);
    return d.missing ?? 0;
  }, []);

  // Initial load + throttled geocode backfill loop for entities missing coords.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let missing = await loadGeo();
      let guard = 0;
      while (missing > 0 && guard < 8 && !cancelled) {
        guard++;
        setStatus(`Geocoding ${missing} address${missing === 1 ? "" : "es"}…`);
        const d = await fetch("/api/entities/geocode", { method: "POST" }).then((r) => r.json()).catch(() => ({}));
        if (cancelled) return;
        missing = d.remaining ?? 0;
        await loadGeo();
      }
      if (!cancelled) setStatus(null);
    })();
    return () => { cancelled = true; };
  }, [loadGeo]);

  // Entities inside the current viewport (Airbnb-style list).
  const visible = useMemo(() => {
    if (!viewport) return entities;
    const { south, west, north, east } = viewport;
    return entities.filter((e) => e.lat >= south && e.lat <= north && e.lng >= west && e.lng <= east);
  }, [entities, viewport]);

  async function findHere() {
    if (!query.trim()) return;
    setFinding(true);
    setStatus("Researching this area…");
    try {
      const res = await fetch("/api/entities/find-here", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, lat: viewport?.centerLat, lng: viewport?.centerLng }),
      });
      const d = await res.json().catch(() => ({}));
      setStatus(res.ok ? `Added ${d.added} ${d.added === 1 ? "company" : "companies"}.` : (d.error ?? "Find failed."));
      if (res.ok) { setQuery(""); await loadGeo(); }
    } finally { setFinding(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/crm?tab=entities" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to CRM
        </Link>
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
      </div>

      <FloatIn>
        <div className="relative h-[55vh] overflow-hidden rounded-3xl border border-border shadow-sm">
          <EntityMap entities={entities} onViewport={setViewport} />
        </div>
      </FloatIn>

      {/* Find entities here */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") findHere(); }}
          placeholder="Find entities here, describe who you want, then Enter…"
          className="pl-9 pr-28"
        />
        <Button size="sm" onClick={findHere} disabled={finding || !query.trim()} className="absolute right-1.5 top-1/2 -translate-y-1/2">
          {finding ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Find here
        </Button>
      </div>

      {/* Viewport list */}
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {visible.length} {visible.length === 1 ? "company" : "companies"} in view
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {visible.map((e) => (
            <Link key={e.id} href={`/crm/entity/${e.id}`}
              className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30">
              <p className="font-medium text-foreground">{e.name}</p>
              <p className="text-sm text-muted-foreground">{[e.industry, e.location].filter(Boolean).join(" · ") || e.domain}</p>
            </Link>
          ))}
        </div>
        {entities.length === 0 && !status && (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <p className="font-brand text-base">No mapped companies yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Entities with an address appear here once geocoded, or use Find here to add some.</p>
          </div>
        )}
      </div>
    </div>
  );
}
