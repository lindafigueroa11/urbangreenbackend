const fs = require("fs");
const path = require("path");
const { categorize, categoryLabelEs } = require("./greenZoneCategorize");
const { mergeExternalPlacesIntoZones } = require("./externalPlaces");

const HERMOSILLO_BBOX = {
  south: 28.95,
  west: -111.12,
  north: 29.2,
  east: -110.8
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cacheFilePath = path.join(__dirname, "../../data/hermosillo-green-zones.json");
const placeIdMapPath = path.join(__dirname, "../../data/park-google-place-ids.json");

function readGooglePlaceIdMap() {
  try {
    if (!fs.existsSync(placeIdMapPath)) return {};
    const raw = JSON.parse(fs.readFileSync(placeIdMapPath, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function attachGooglePlaceIds(zones = []) {
  const map = readGooglePlaceIdMap();
  return zones.map((z) => {
    const pid = map[z.id];
    const trimmed = typeof pid === "string" ? pid.trim() : "";
    if (!trimmed) return z;
    return { ...z, google_place_id: trimmed };
  });
}

let inMemoryCache = {
  fetchedAt: 0,
  source: "none",
  zones: []
};

function fallbackEntry(id, name, lat, lng) {
  const osm = { leisure: "park", name };
  const { code, confidence } = categorize(osm, name);
  return {
    id,
    name,
    latitude: lat,
    longitude: lng,
    polygon: null,
    category_code: code,
    confidence,
    sources: ["osm"],
    tags: { osm, external: {} },
    category: categoryLabelEs(code)
  };
}

const fallbackZones = [
  fallbackEntry("fallback-1", "Parque Madero", 29.0876, -110.9525),
  fallbackEntry("fallback-2", "Parque La Ruina", 29.1215, -110.9675),
  fallbackEntry("fallback-3", "Parque Infantil", 29.0824, -110.9559),
  fallbackEntry("fallback-4", "Bosque Urbano La Sauceda", 29.1044, -110.9748),
  fallbackEntry("fallback-5", "Parque Solidaridad", 29.1118, -110.9344),
  fallbackEntry("fallback-6", "Parque Francisco I. Madero", 29.0872, -110.9513),
  fallbackEntry("fallback-7", "Parque de la Madre", 29.0735, -110.9536),
  fallbackEntry("fallback-8", "Parque Hundido", 29.0992, -110.9488)
];

function sanitizeZones(zones = []) {
  return zones.filter((z) => {
    const name = String(z?.name || "").trim();
    if (!name) return false;
    return !/^zona verde\s+way\//i.test(name);
  });
}

function ensureDataDir() {
  fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
}

function buildOverpassQuery() {
  const { south, west, north, east } = HERMOSILLO_BBOX;
  const leisureExtra =
    "garden|nature_reserve|recreation_ground|playground|stadium|sports_centre|track|golf_course|fitness_station|skatepark";
  return `
[out:json][timeout:120];
(
  way["leisure"="park"](${south},${west},${north},${east});
  way["leisure"="pitch"](${south},${west},${north},${east});
  way["landuse"="grass"](${south},${west},${north},${east});
  way["natural"="wood"](${south},${west},${north},${east});
  way["natural"="scrub"](${south},${west},${north},${east});
  way["highway"="path"](${south},${west},${north},${east});
  relation["leisure"="park"](${south},${west},${north},${east});
  way["leisure"~"${leisureExtra}"](${south},${west},${north},${east});
  relation["leisure"~"${leisureExtra}"](${south},${west},${north},${east});
  way["landuse"~"forest|village_green|recreation_ground"](${south},${west},${north},${east});
  relation["landuse"~"forest|village_green|recreation_ground"](${south},${west},${north},${east});
);
out tags center geom;
  `.trim();
}

function normalizeOsmZoneShape({ id, name, latitude, longitude, polygon, tags }) {
  const osmTags = { ...(tags || {}) };
  const { code, confidence } = categorize(osmTags, name);
  return {
    id,
    name,
    latitude,
    longitude,
    polygon,
    category_code: code,
    confidence,
    sources: ["osm"],
    tags: { osm: osmTags, external: {} },
    category: categoryLabelEs(code)
  };
}

function migrateZoneShape(zone) {
  if (!zone || typeof zone !== "object") return zone;
  if (zone.category_code && zone.tags && zone.tags.osm !== undefined) {
    return {
      ...zone,
      category: zone.category || categoryLabelEs(zone.category_code),
      sources: zone.sources?.length ? zone.sources : ["osm"],
      tags: {
        osm: zone.tags.osm || {},
        external: zone.tags.external && typeof zone.tags.external === "object" ? zone.tags.external : {}
      }
    };
  }
  const flat = zone.tags && !zone.tags.osm ? zone.tags : {};
  const osm = zone.tags?.osm ?? flat;
  const name = zone.name || "";
  const { code, confidence } = categorize(osm, name);
  return {
    ...zone,
    category_code: zone.category_code || code,
    confidence: zone.confidence ?? confidence,
    sources: zone.sources?.length ? zone.sources : ["osm"],
    tags: {
      osm: osm && typeof osm === "object" ? osm : {},
      external: zone.tags?.external && typeof zone.tags.external === "object" ? zone.tags.external : {}
    },
    category: zone.category || categoryLabelEs(zone.category_code || code)
  };
}

function normalizeName(tags = {}) {
  return (
    tags.name ||
    tags["name:es"] ||
    tags.official_name ||
    tags.alt_name ||
    ""
  );
}

function isExcludedByTags(tags = {}, name = "") {
  const text = `${name} ${tags.leisure || ""} ${tags.landuse || ""} ${tags.natural || ""}`.toLowerCase();
  return (
    text.includes("cemeter") ||
    text.includes("industrial") ||
    text.includes("parking") ||
    text.includes("residential")
  );
}

function getCenter(element) {
  if (element?.center?.lat !== undefined && element?.center?.lon !== undefined) {
    return { latitude: Number(element.center.lat), longitude: Number(element.center.lon) };
  }
  const geom = Array.isArray(element?.geometry) ? element.geometry : [];
  if (!geom.length) return null;
  const lat = geom.reduce((acc, p) => acc + Number(p.lat || 0), 0) / geom.length;
  const lon = geom.reduce((acc, p) => acc + Number(p.lon || 0), 0) / geom.length;
  return { latitude: lat, longitude: lon };
}

function transformOverpassElements(elements = []) {
  const mapped = elements
    .map((element) => {
      const center = getCenter(element);
      if (!center) return null;

      const tags = element.tags || {};
      const id = `${element.type || "feature"}/${element.id || Math.random().toString(36).slice(2)}`;
      const name = normalizeName(tags);
      if (!name || isExcludedByTags(tags, name)) return null;
      if (tags.highway === "path" && !String(name).trim()) return null;

      const polygon = Array.isArray(element.geometry)
        ? element.geometry.map((p) => [Number(p.lon), Number(p.lat)])
        : null;

      return normalizeOsmZoneShape({
        id,
        name,
        latitude: center.latitude,
        longitude: center.longitude,
        polygon,
        tags
      });
    })
    .filter(Boolean);

  const dedupByName = new Map();
  for (const zone of mapped) {
    const key = `${zone.name.toLowerCase()}|${zone.category_code}`;
    if (!dedupByName.has(key)) {
      dedupByName.set(key, zone);
    }
  }
  return Array.from(dedupByName.values());
}

async function fetchFromOverpass() {
  const query = buildOverpassQuery();
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain"
    },
    body: query
  });

  if (!response.ok) {
    throw new Error(`Overpass API error (${response.status})`);
  }

  const json = await response.json();
  const zones = transformOverpassElements(json?.elements || []);
  if (!zones.length) {
    throw new Error("No green zones returned by Overpass");
  }
  return zones;
}

function readFromDiskCache() {
  try {
    if (!fs.existsSync(cacheFilePath)) return null;
    const raw = fs.readFileSync(cacheFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.zones) || !parsed.zones.length) return null;
    const migrated = parsed.zones.map(migrateZoneShape);
    const cleanZones = sanitizeZones(migrated);
    if (!cleanZones.length) return null;
    return { ...parsed, zones: cleanZones };
  } catch {
    return null;
  }
}

function writeToDiskCache(payload) {
  try {
    ensureDataDir();
    fs.writeFileSync(cacheFilePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // ignore disk cache write errors
  }
}

function clearGreenZonesDiskCache() {
  try {
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }
  } catch {
    // ignore
  }
}

function resetGreenZonesMemoryCache() {
  inMemoryCache = {
    fetchedAt: 0,
    source: "none",
    zones: []
  };
}

/** Vacía memoria y borra el JSON en disco (p. ej. antes de redeploy o vía script). */
function invalidateGreenZonesCache() {
  resetGreenZonesMemoryCache();
  clearGreenZonesDiskCache();
}

async function getHermosilloGreenZones({ forceRefresh = false } = {}) {
  const now = Date.now();
  const cacheFresh =
    inMemoryCache.zones.length > 0 &&
    now - inMemoryCache.fetchedAt < CACHE_TTL_MS;

  if (!forceRefresh && cacheFresh) {
    return inMemoryCache;
  }

  try {
    const zones = await fetchFromOverpass();
    const cleanZones = sanitizeZones(zones);
    if (!cleanZones.length) {
      throw new Error("No named green zones after sanitization");
    }
    const hasExternalKeys =
      (process.env.GEOAPIFY_API_KEY && String(process.env.GEOAPIFY_API_KEY).trim()) ||
      (process.env.FOURSQUARE_API_KEY && String(process.env.FOURSQUARE_API_KEY).trim());
    const merged = hasExternalKeys
      ? await mergeExternalPlacesIntoZones(cleanZones, HERMOSILLO_BBOX)
      : cleanZones;
    const payload = {
      fetchedAt: now,
      source: hasExternalKeys ? "overpass+external" : "overpass",
      zones: merged
    };
    inMemoryCache = payload;
    writeToDiskCache(payload);
    return payload;
  } catch (error) {
    const disk = readFromDiskCache();
    if (disk?.zones?.length) {
      inMemoryCache = {
        fetchedAt: disk.fetchedAt || now,
        source: "disk_cache",
        zones: disk.zones
      };
      return inMemoryCache;
    }

    inMemoryCache = {
      fetchedAt: now,
      source: "fallback_seed",
      zones: fallbackZones
    };
    return inMemoryCache;
  }
}

function pointInPolygon(lat, lng, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i][0]);
    const yi = Number(polygon[i][1]);
    const xj = Number(polygon[j][0]);
    const yj = Number(polygon[j][1]);

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function normalizePolygon(polygon = []) {
  if (!Array.isArray(polygon)) return [];
  return polygon
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

function orientation(a, b, c) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return (
    b[0] <= Math.max(a[0], c[0]) &&
    b[0] >= Math.min(a[0], c[0]) &&
    b[1] <= Math.max(a[1], c[1]) &&
    b[1] >= Math.min(a[1], c[1])
  );
}

function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function polygonEdges(poly = []) {
  const edges = [];
  if (!Array.isArray(poly) || poly.length < 2) return edges;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    edges.push([a, b]);
  }
  return edges;
}

function polygonsIntersect(polyA = [], polyB = []) {
  if (!Array.isArray(polyA) || !Array.isArray(polyB) || polyA.length < 3 || polyB.length < 3) {
    return false;
  }

  // Vertex of A inside B
  for (const p of polyA) {
    if (pointInPolygon(Number(p[1]), Number(p[0]), polyB)) return true;
  }
  // Vertex of B inside A
  for (const p of polyB) {
    if (pointInPolygon(Number(p[1]), Number(p[0]), polyA)) return true;
  }
  // Edge intersections
  const edgesA = polygonEdges(polyA);
  const edgesB = polygonEdges(polyB);
  for (const [a1, a2] of edgesA) {
    for (const [b1, b2] of edgesB) {
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function estimateCoveragePct(userPolygon = [], zonePolygon = []) {
  if (userPolygon.length < 3 || zonePolygon.length < 3) return null;

  const lngs = userPolygon.map((p) => Number(p[0]));
  const lats = userPolygon.map((p) => Number(p[1]));
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const rows = 14;
  const cols = 14;
  let userCount = 0;
  let overlapCount = 0;

  for (let r = 0; r < rows; r += 1) {
    const lat = minLat + ((maxLat - minLat) * (r + 0.5)) / rows;
    for (let c = 0; c < cols; c += 1) {
      const lng = minLng + ((maxLng - minLng) * (c + 0.5)) / cols;
      const inUser = pointInPolygon(lat, lng, userPolygon);
      if (!inUser) continue;
      userCount += 1;
      if (pointInPolygon(lat, lng, zonePolygon)) {
        overlapCount += 1;
      }
    }
  }

  if (!userCount) return null;
  return Number(((overlapCount / userCount) * 100).toFixed(2));
}

async function getGreenZonesInsidePolygon(polygon, options = {}) {
  const userPolygon = normalizePolygon(polygon);
  if (userPolygon.length < 3) {
    return {
      source: "invalid_polygon",
      fetchedAt: Date.now(),
      zones: []
    };
  }

  const payload = await getHermosilloGreenZones(options);
  const filtered = payload.zones
    .map((zone) => {
      const zonePolygon = normalizePolygon(zone.polygon || []);
      const centerInside = pointInPolygon(zone.latitude, zone.longitude, userPolygon);

      if (zonePolygon.length >= 3) {
        const intersects = polygonsIntersect(userPolygon, zonePolygon);
        if (!intersects) return null;

        return {
          ...zone,
          matched_by: centerInside ? "center_and_polygon" : "polygon_overlap",
          coverage_pct: estimateCoveragePct(userPolygon, zonePolygon)
        };
      }

      if (!centerInside) return null;
      return {
        ...zone,
        matched_by: "center_point",
        coverage_pct: null
      };
    })
    .filter(Boolean);

  return {
    source: payload.source,
    fetchedAt: payload.fetchedAt,
    zones: attachGooglePlaceIds(filtered)
  };
}

module.exports = {
  getHermosilloGreenZones,
  getGreenZonesInsidePolygon,
  attachGooglePlaceIds,
  categorize,
  categoryLabelEs,
  migrateZoneShape,
  invalidateGreenZonesCache,
  clearGreenZonesDiskCache,
  resetGreenZonesMemoryCache
};
