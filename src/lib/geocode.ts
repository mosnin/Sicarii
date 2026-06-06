// Geocoding via OpenStreetMap Nominatim (free, no key). Respect their usage
// policy: identify with a User-Agent and keep request volume low (we throttle
// callers and cache results onto the entity).

import { prisma } from "@/lib/prisma";

export interface GeoResult { lat: number; lng: number; displayName: string }

function normalizeQuery(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

// Cached geocode backed by the shared GeocodeCache table. The same address (or
// city) only ever hits Nominatim once, so repeats are instant. Returns whether
// the answer came from cache so callers can skip the 1 req/sec throttle when no
// network call was made. Only successful hits are cached, so a transient
// failure is retried next time rather than remembered as a permanent miss.
export async function geocodeCached(
  address: string,
): Promise<{ result: GeoResult | null; cached: boolean }> {
  const key = normalizeQuery(address);
  if (!key) return { result: null, cached: true };

  const hit = await prisma.geocodeCache.findUnique({ where: { query: key } }).catch(() => null);
  if (hit) {
    const result =
      hit.lat != null && hit.lng != null
        ? { lat: hit.lat, lng: hit.lng, displayName: hit.displayName ?? "" }
        : null;
    return { result, cached: true };
  }

  const result = await geocode(address);
  if (result) {
    await prisma.geocodeCache
      .create({ data: { query: key, lat: result.lat, lng: result.lng, displayName: result.displayName } })
      .catch(() => {}); // ignore unique races
  }
  return { result, cached: false };
}

export async function geocode(address: string): Promise<GeoResult | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Scalar CRM (https://www.tryscalar.xyz)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const hit = data[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng, displayName: hit.display_name };
  } catch {
    return null;
  }
}

// Reverse geocode a point to a human place name (for "find entities here").
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Scalar CRM (https://www.tryscalar.xyz)", "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    const a = data.address ?? {};
    return a.city || a.town || a.state || a.country || data.display_name || null;
  } catch {
    return null;
  }
}
