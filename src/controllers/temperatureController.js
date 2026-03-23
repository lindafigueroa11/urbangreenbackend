const {
  fetchCurrentTemperature,
  cacheKey,
} = require("../../services/openMeteoTemperature");

const MAX_BATCH = 40;

function parseLatLng(query) {
  const latRaw = query.latitude ?? query.lat;
  const lonRaw = query.longitude ?? query.lng ?? query.lon;
  const lat = latRaw != null ? Number(latRaw) : NaN;
  const lon = lonRaw != null ? Number(lonRaw) : NaN;
  return { lat, lon };
}

/**
 * GET /weather/temperature?latitude=&longitude=
 */
async function getTemperature(req, res) {
  try {
    const { lat, lon } = parseLatLng(req.query);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({
        error: "Invalid query",
        details: "Usa latitude y longitude (o lat y lng) numéricos.",
      });
    }

    const data = await fetchCurrentTemperature(lat, lon);
    if (!data) {
      return res.status(502).json({
        error: "Sin datos de temperatura",
        details: "Open-Meteo no devolvió lectura actual.",
      });
    }

    return res.status(200).json({
      provider: "Open-Meteo",
      attribution_url: "https://open-meteo.com",
      latitude: lat,
      longitude: lon,
      temperature_c: data.temperature_c,
      observed_at: data.observed_at,
      timezone: data.timezone,
    });
  } catch (e) {
    const code = e.statusCode === 502 ? 502 : 400;
    return res.status(code).json({
      error: "Temperature lookup failed",
      details: e.message || "Error desconocido",
    });
  }
}

/**
 * POST /weather/temperature/batch
 * Body: { points: [ { id: string, latitude: number, longitude: number } ] }
 */
async function postTemperatureBatch(req, res) {
  const points = req.body?.points;
  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({
      error: "Invalid body",
      details: 'Envía { "points": [ { "id", "latitude", "longitude" }, ... ] }',
    });
  }
  if (points.length > MAX_BATCH) {
    return res.status(400).json({
      error: "Too many points",
      details: `Máximo ${MAX_BATCH} puntos por petición.`,
    });
  }

  /** @type {Map<string, { lat: number, lon: number }>} */
  const uniqueCells = new Map();

  const normalized = points.map((p) => {
    const id = p?.id != null ? String(p.id) : "";
    const lat = Number(p?.latitude);
    const lon = Number(p?.longitude);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return {
        kind: "error",
        payload: {
          id: id || "(sin id)",
          latitude: lat,
          longitude: lon,
          error: "invalid_point",
        },
      };
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return {
        kind: "error",
        payload: {
          id,
          latitude: lat,
          longitude: lon,
          error: "coordinates_out_of_range",
        },
      };
    }
    const k = cacheKey(lat, lon);
    if (!uniqueCells.has(k)) {
      uniqueCells.set(k, { lat, lon });
    }
    return { kind: "ok", id, lat, lon, key: k };
  });

  /** @type {Map<string, { data: object | null, error: string | null }>} */
  const resolved = new Map();
  await Promise.all(
    [...uniqueCells.entries()].map(async ([k, { lat, lon }]) => {
      try {
        const data = await fetchCurrentTemperature(lat, lon);
        if (!data) {
          resolved.set(k, { data: null, error: "no_data" });
        } else {
          resolved.set(k, { data, error: null });
        }
      } catch (err) {
        resolved.set(k, {
          data: null,
          error: err.message || "fetch_failed",
        });
      }
    })
  );

  const results = normalized.map((n) => {
    if (n.kind === "error") return n.payload;
    const slot = resolved.get(n.key);
    if (!slot || slot.error) {
      return {
        id: n.id,
        latitude: n.lat,
        longitude: n.lon,
        error: slot?.error || "unknown",
      };
    }
    return {
      id: n.id,
      latitude: n.lat,
      longitude: n.lon,
      temperature_c: slot.data.temperature_c,
      observed_at: slot.data.observed_at,
      timezone: slot.data.timezone,
    };
  });

  return res.status(200).json({
    provider: "Open-Meteo",
    attribution_url: "https://open-meteo.com",
    fetched_at_ms: Date.now(),
    results,
  });
}

module.exports = {
  getTemperature,
  postTemperatureBatch,
};
