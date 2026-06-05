// Geocoding via OpenStreetMap Nominatim (free, no key). Respect their usage
// policy: identify with a User-Agent and keep request volume low (we throttle
// callers and cache results onto the entity).

export interface GeoResult { lat: number; lng: number; displayName: string }

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
