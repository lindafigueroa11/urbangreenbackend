const { categorize, categoryLabelEs } = require("./greenZoneCategorize");

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9áéíóúñ\s]/gi, " ")
    .trim();
}

function namesSimilar(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/).filter((w) => w.length > 3);
  const wb = nb.split(/\s+/).filter((w) => w.length > 3);
  if (wa.length && wb.length && wa[0] === wb[0]) return true;
  return false;
}

/** Geoapify category string → { code, confidence } */
function mapGeoapifyCategories(categories = []) {
  const joined = Array.isArray(categories) ? categories.join(",") : String(categories);
  const j = joined.toLowerCase();
  if (/national_park|protected_area|nature_reserve/.test(j)) {
    return { code: "forest", confidence: 0.82 };
  }
  if (/leisure\.park|park/.test(j) && !/dog/.test(j)) {
    return { code: "park", confidence: 0.82 };
  }
  if (/sport|stadium|pitch|golf|fitness/.test(j)) {
    return { code: "sports", confidence: 0.78 };
  }
  if (/garden|recreation|playground/.test(j)) {
    return { code: "green_area", confidence: 0.72 };
  }
  return { code: "green_area", confidence: 0.65 };
}

async function fetchGeoapifyPlaces(bbox) {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key || typeof key !== "string" || !key.trim()) return [];

  const { south, west, north, east } = bbox;
  const categories =
    "leisure.park,national_park,leisure.garden,leisure.sports_centre,leisure.playground";
  const filter = `rect:${west},${south},${east},${north}`;
  const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(
    categories
  )}&filter=${encodeURIComponent(filter)}&limit=80&apiKey=${encodeURIComponent(key.trim())}`;

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return [];
    const json = await res.json();
    const feats = Array.isArray(json?.features) ? json.features : [];
    return feats
      .map((f) => {
        const p = f?.properties || {};
        const geom = f?.geometry;
        const coords = geom?.type === "Point" ? geom.coordinates : null;
        if (!coords || coords.length < 2) return null;
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const name = p.name || p.street || "";
        if (!String(name).trim()) return null;
        const cats = p.categories || p.datasource?.raw?.categories || [];
        const { code, confidence } = mapGeoapifyCategories(
          Array.isArray(cats) ? cats : [String(cats)]
        );
        return {
          provider: "geoapify",
          name: String(name).trim(),
          latitude: lat,
          longitude: lon,
          category_code: code,
          confidence,
          external: {
            provider: "geoapify",
            place_id: p.place_id || f.id || null,
            categories: cats,
            raw: p
          }
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Foursquare place → { code, confidence } */
function mapFoursquarePlace(p = {}) {
  const cats = p.categories || [];
  const first = cats[0] || {};
  const label = String(first.name || "").toLowerCase();
  if (/park|parque|national|forest|bosque|nature|reserve/.test(label)) {
    return { code: "park", confidence: 0.8 };
  }
  if (/sport|stadium|golf|athletic|field|cancha/.test(label)) {
    return { code: "sports", confidence: 0.78 };
  }
  return { code: "green_area", confidence: 0.68 };
}

async function fetchFoursquarePlaces(bbox) {
  const key = process.env.FOURSQUARE_API_KEY;
  if (!key || typeof key !== "string" || !key.trim()) return [];

  const { south, west, north, east } = bbox;
  const lat = (south + north) / 2;
  const lng = (west + east) / 2;
  const radius = Math.min(
    100000,
    Math.max(5000, haversineMeters(lat, west, lat, east) / 2)
  );

  const url = new URL("https://places-api.foursquare.com/places/search");
  url.searchParams.set("ll", `${lat},${lng}`);
  url.searchParams.set("radius", String(Math.round(radius)));
  url.searchParams.set("limit", "40");
  url.searchParams.set("query", "park");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: key.trim(),
        Accept: "application/json"
      }
    });
    if (!res.ok) return [];
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .map((r) => {
        const geo = r.geocodes?.main || r.location || {};
        const lat2 = Number(geo.latitude ?? geo.lat);
        const lng2 = Number(geo.longitude ?? geo.lng ?? geo.long);
        if (!Number.isFinite(lat2) || !Number.isFinite(lng2)) return null;
        const name = r.name || "";
        if (!String(name).trim()) return null;
        const { code, confidence } = mapFoursquarePlace(r);
        return {
          provider: "foursquare",
          name: String(name).trim(),
          latitude: lat2,
          longitude: lng2,
          category_code: code,
          confidence,
          external: {
            provider: "foursquare",
            fsq_id: r.fsq_id || r.fsqId || null,
            categories: r.categories,
            raw: r
          }
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const MERGE_RADIUS_M = 95;

/**
 * @param {object[]} zones — ya normalizadas con category_code, tags.osm, etc.
 * @param {object} bbox
 */
async function mergeExternalPlacesIntoZones(zones = [], bbox) {
  const [geoList, fsqList] = await Promise.all([
    fetchGeoapifyPlaces(bbox),
    fetchFoursquarePlaces(bbox)
  ]);

  const external = [...geoList, ...fsqList];
  if (!external.length) return zones;

  const usedExternal = new Set();
  const out = zones.map((z) => ({ ...z }));

  for (let i = 0; i < out.length; i += 1) {
    const z = out[i];
    let bestIdx = -1;
    let bestDist = MERGE_RADIUS_M + 1;
    for (let j = 0; j < external.length; j += 1) {
      if (usedExternal.has(j)) continue;
      const e = external[j];
      const d = haversineMeters(z.latitude, z.longitude, e.latitude, e.longitude);
      if (d <= MERGE_RADIUS_M && d < bestDist && namesSimilar(z.name, e.name)) {
        bestDist = d;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) {
      usedExternal.add(bestIdx);
      const e = external[bestIdx];
      const src = new Set(z.sources || ["osm"]);
      src.add(e.provider);
      const conf = Math.max(Number(z.confidence) || 0, e.confidence);
      const ext = { ...(z.tags?.external || {}) };
      ext[e.provider] = e.external;
      out[i] = {
        ...z,
        sources: Array.from(src),
        confidence: Number(conf.toFixed(4)),
        tags: { osm: z.tags?.osm || {}, external: ext },
        category_code: z.category_code,
        category: categoryLabelEs(z.category_code)
      };
    }
  }

  for (let j = 0; j < external.length; j += 1) {
    if (usedExternal.has(j)) continue;
    const e = external[j];
    const id = `${e.provider}/${e.name.slice(0, 40).replace(/\s+/g, "_")}-${j}`;
    out.push({
      id,
      name: e.name,
      latitude: e.latitude,
      longitude: e.longitude,
      polygon: null,
      category_code: e.category_code,
      confidence: e.confidence,
      sources: [e.provider],
      tags: { osm: {}, external: { [e.provider]: e.external } },
      category: categoryLabelEs(e.category_code)
    });
  }

  return out;
}

module.exports = {
  mergeExternalPlacesIntoZones,
  fetchGeoapifyPlaces,
  fetchFoursquarePlaces,
  haversineMeters
};
