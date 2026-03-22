const {
  getHermosilloGreenZones,
  getGreenZonesInsidePolygon
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
      zones: data.zones
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
    const forceRefresh = Boolean(req.body?.refresh);

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

module.exports = {
  listHermosilloGreenZones,
  intersectHermosilloGreenZones
};
