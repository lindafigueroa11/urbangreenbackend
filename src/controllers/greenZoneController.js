const {
  fetchPlacePhotoBuffer,
  fetchPlacePhotoCount,
} = require("../../services/googlePlacesPhoto");
const {
  getHermosilloGreenZones,
  getGreenZonesInsidePolygon,
  attachGooglePlaceIds
} = require("../services/greenZoneService");

function isValidPolygon(polygon) {
  return (
    Array.isArray(polygon) &&
    polygon.length >= 3 &&
    polygon.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        Number.isFinite(Number(p[0])) &&
        Number.isFinite(Number(p[1]))
    )
  );
}

async function listHermosilloGreenZones(req, res) {
  try {
    const forceRefresh = String(req.query.refresh || "").toLowerCase() === "true";
    const data = await getHermosilloGreenZones({ forceRefresh });
    return res.json({
      city: "Hermosillo",
      source: data.source,
      fetched_at: data.fetchedAt,
      total: data.zones.length,
      zones: attachGooglePlaceIds(data.zones)
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load green zones",
      details: error.message
    });
  }
}

async function intersectHermosilloGreenZones(req, res) {
  try {
    const polygon = req.body?.polygon;
    const rawRefresh = req.body?.refresh;
    const forceRefresh =
      rawRefresh === true ||
      String(rawRefresh || "").toLowerCase() === "true" ||
      rawRefresh === 1;

    if (!isValidPolygon(polygon)) {
      return res.status(400).json({
        error: "Invalid polygon. Expected an array of [lng, lat] with at least 3 points."
      });
    }

    const result = await getGreenZonesInsidePolygon(polygon, { forceRefresh });
    return res.json({
      city: "Hermosillo",
      source: result.source,
      fetched_at: result.fetchedAt,
      total: result.zones.length,
      zones: result.zones
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to intersect green zones",
      details: error.message
    });
  }
}

async function proxyGooglePlacePhoto(req, res) {
  try {
    const placeId = req.query.placeId || req.query.place_id;
    if (!placeId || typeof placeId !== "string" || placeId.length > 400) {
      return res.status(400).json({ error: "Query placeId (Place ID de Google) requerido." });
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({
        error: "Fotos de Places no configuradas",
        details: "Define GOOGLE_PLACES_API_KEY en el servidor y activa Places API (New)."
      });
    }

    const maxW = Math.min(
      4800,
      Math.max(1, Number(req.query.maxWidthPx) || 800)
    );

    const indexRaw = req.query.index ?? req.query.photoIndex;
    const photoIndex = Number.isFinite(Number(indexRaw))
      ? Number(indexRaw)
      : 0;

    const result = await fetchPlacePhotoBuffer(placeId.trim(), maxW, photoIndex);
    if (!result) {
      return res.status(404).json({ error: "Este lugar no tiene fotos en Google Places." });
    }

    res.setHeader("Content-Type", result.contentType);
    if (result.attributions) {
      res.setHeader("X-Place-Photo-Attributions", result.attributions);
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(result.buffer);
  } catch (error) {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return res.status(status).json({
      error: "No se pudo obtener la foto del lugar",
      details: error.message
    });
  }
}

async function proxyGooglePlacePhotoCount(req, res) {
  try {
    const placeId = req.query.placeId || req.query.place_id;
    if (!placeId || typeof placeId !== "string" || placeId.length > 400) {
      return res.status(400).json({ error: "Query placeId requerido." });
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({
        error: "Fotos de Places no configuradas",
        details: "Define GOOGLE_PLACES_API_KEY en el servidor y activa Places API (New).",
      });
    }

    const { count, attributions } = await fetchPlacePhotoCount(placeId.trim());
    return res.json({
      count,
      attributions: attributions || undefined,
    });
  } catch (error) {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return res.status(status).json({
      error: "No se pudo obtener el conteo de fotos del lugar",
      details: error.message,
    });
  }
}

module.exports = {
  listHermosilloGreenZones,
  intersectHermosilloGreenZones,
  proxyGooglePlacePhoto,
  proxyGooglePlacePhotoCount,
};
