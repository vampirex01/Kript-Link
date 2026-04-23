import { env } from "./env.js";

export interface GeoResult {
  countryCode: string | null;
  city: string | null;
  region: string | null;
}

interface IpinfoLiteResponse {
  country_code?: string | null;
}

const LOOKUP_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: GeoResult; expiresAt: number }>();

const EMPTY_GEO_RESULT: GeoResult = {
  countryCode: null,
  city: null,
  region: null,
};

function normalizeIpAddress(ipAddress: string): string {
  const normalized = ipAddress.trim();

  if (normalized.startsWith("::ffff:")) {
    return normalized.slice(7);
  }

  return normalized;
}

function getCachedGeo(ipAddress: string): GeoResult | null {
  const cached = cache.get(ipAddress);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    cache.delete(ipAddress);
    return null;
  }

  return cached.value;
}

function setCachedGeo(ipAddress: string, value: GeoResult): void {
  cache.set(ipAddress, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function fetchGeoFromIpinfo(ipAddress: string): Promise<GeoResult> {
  if (!env.IPINFO_TOKEN) {
    return EMPTY_GEO_RESULT;
  }

  const url = new URL(
    `https://api.ipinfo.io/lite/${encodeURIComponent(ipAddress)}`,
  );
  url.searchParams.set("token", env.IPINFO_TOKEN);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return EMPTY_GEO_RESULT;
    }

    const payload = (await response.json()) as IpinfoLiteResponse;

    return {
      countryCode: payload.country_code?.toUpperCase() ?? null,
      city: null,
      region: null,
    };
  } catch {
    return EMPTY_GEO_RESULT;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupIP(ipAddress: string): Promise<GeoResult> {
  const normalizedIp = normalizeIpAddress(ipAddress);

  if (!normalizedIp) {
    return EMPTY_GEO_RESULT;
  }

  const cached = getCachedGeo(normalizedIp);

  if (cached) {
    return cached;
  }

  const result = await fetchGeoFromIpinfo(normalizedIp);
  setCachedGeo(normalizedIp, result);

  return result;
}
