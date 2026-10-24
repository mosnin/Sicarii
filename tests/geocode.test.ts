// Nominatim geocode: empty queries must not hit the network, cache keys must
// collapse whitespace/case, and a malformed hit must not become a coordinate.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { findUnique, create } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    geocodeCache: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => create(...a),
    },
  },
}));

import { geocode, geocodeCached, reverseGeocode } from "@/lib/geocode";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  findUnique.mockResolvedValue(null);
  create.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("geocode", () => {
  it("returns null for blank input and never fetches", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(geocode("")).resolves.toBeNull();
    await expect(geocode("   ")).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses the first Nominatim hit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          { lat: "37.7749", lon: "-122.4194", display_name: "San Francisco, CA" },
        ]),
      ),
    );
    await expect(geocode("San Francisco")).resolves.toEqual({
      lat: 37.7749,
      lng: -122.4194,
      displayName: "San Francisco, CA",
    });
  });

  it("returns null for NaN coordinates, an empty array, or a thrown fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ lat: "x", lon: "y", display_name: "n" }])));
    await expect(geocode("nowhere")).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    await expect(geocode("nowhere")).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("timeout");
    }));
    await expect(geocode("nowhere")).resolves.toBeNull();
  });
});

describe("geocodeCached", () => {
  it("treats a blank query as a cached miss and never reads the table", async () => {
    await expect(geocodeCached("   ")).resolves.toEqual({ result: null, cached: true });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("normalizes case and whitespace before the cache lookup", async () => {
    findUnique.mockResolvedValue({ lat: 1, lng: 2, displayName: "Cached" });
    const out = await geocodeCached("  San   FRANCISCO  ");
    expect(findUnique).toHaveBeenCalledWith({ where: { query: "san francisco" } });
    expect(out).toEqual({
      result: { lat: 1, lng: 2, displayName: "Cached" },
      cached: true,
    });
  });

  it("does not treat a cached row with null coords as a hit result, and skips a network write on miss", async () => {
    findUnique.mockResolvedValue({ lat: null, lng: null, displayName: null });
    await expect(geocodeCached("x")).resolves.toEqual({ result: null, cached: true });
  });

  it("writes a successful live lookup into the cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([{ lat: "10", lon: "20", display_name: "Here" }])),
    );
    const out = await geocodeCached("Here");
    expect(out.cached).toBe(false);
    expect(out.result).toEqual({ lat: 10, lng: 20, displayName: "Here" });
    expect(create).toHaveBeenCalledWith({
      data: { query: "here", lat: 10, lng: 20, displayName: "Here" },
    });
  });
});

describe("reverseGeocode", () => {
  it("prefers city, then town, then state, then country", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          display_name: "full",
          address: { town: "Palo Alto", state: "California", country: "USA" },
        }),
      ),
    );
    await expect(reverseGeocode(37.4, -122.1)).resolves.toBe("Palo Alto");
  });

  it("returns null when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("down");
    }));
    await expect(reverseGeocode(0, 0)).resolves.toBeNull();
  });
});
