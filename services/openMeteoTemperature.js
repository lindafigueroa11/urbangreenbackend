/**
 * Temperatura actual (2 m) vía Open-Meteo — API gratuita, sin clave.
 * Atribución: https://open-meteo.com
 */

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;
const memoryCache = new Map();

function roundCoord(n, decimals = 4) {
  const f = 10 ** decimals;
  return Math.round(Number(n) * f) / f;
}

function cacheKey(lat, lon) {
  return `${roundCoord(lat)}:${roundCoord(lon)}`;
}

function cacheGet(key) {
  const e = memoryCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key, value) {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const first = memoryCache.keys().next().value;
    memoryCache.delete(first);
  }
  memoryCache.set(key, { value, ts: Date.now() });
}

/**
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{ temperature_c: number, observed_at: string, timezone?: string } | null>}
 */
async function fetchCurrentTemperature(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Invalid coordinates");
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("Coordinates out of range");
  }

  const key = cacheKey(lat, lon);
  const hit = cacheGet(key);
  if (hit) return hit;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m",
    timezone: "America/Hermosillo",
  });

  const res = await fetch(`${OPEN_METEO_FORECAST}?${params.toString()}`, {
    headers: {
      "User-Agent": "UrbanGreenBackend/1.0",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Open-Meteo failed: ${res.status} ${text}`);
    err.statusCode = 502;
    throw err;
  }

  const data = await res.json();
  const t = data?.current?.temperature_2m;
  const observedAt = data?.current?.time;
  if (!Number.isFinite(Number(t)) || typeof observedAt !== "string") {
    return null;
  }

  const value = {
    temperature_c: Number(t),
    observed_at: observedAt,
    timezone: typeof data?.timezone === "string" ? data.timezone : undefined,
  };
  cacheSet(key, value);
  return value;
}

module.exports = {
  fetchCurrentTemperature,
  cacheKey,
};
