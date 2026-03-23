/**
 * Busca en Google Places (API nueva) un Place ID por cada zona verde del cache
 * y genera/actualiza data/park-google-place-ids.json
 *
 * Uso:
 *   set GOOGLE_PLACES_API_KEY=tu_clave   (Windows: set GOOGLE_PLACES_API_KEY=...)
 *   node scripts/build-park-google-place-ids.js
 *   node scripts/build-park-google-place-ids.js --limit=5 --dry-run
 *   node scripts/build-park-google-place-ids.js --write
 *
 * Requiere: Places API (New) activada y facturación en Google Cloud.
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const ZONES_PATH = path.join(__dirname, "../data/hermosillo-green-zones.json");
const OUTPUT_PATH = path.join(__dirname, "../data/park-google-place-ids.json");
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = Infinity;
  let dryRun = false;
  let write = false;
  for (const a of args) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]) || 0;
    if (a === "--dry-run") dryRun = true;
    if (a === "--write") write = true;
  }
  return { limit, dryRun, write };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractPlaceId(place) {
  const raw = place?.id || place?.name || "";
  return String(raw).replace(/^places\//, "").trim();
}

async function searchTextForZone(zone) {
  const { name, latitude, longitude } = zone;
  const body = {
    textQuery: `${name} Hermosillo Sonora México`,
    maxResultCount: 8,
    locationBias: {
      circle: {
        center: { latitude, longitude },
        radius: 2500,
      },
    },
  };

  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta no JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`searchText ${res.status}: ${text.slice(0, 400)}`);
  }

  const places = Array.isArray(data.places) ? data.places : [];
  if (places.length === 0) return null;

  let best = null;
  let bestD = Infinity;
  for (const p of places) {
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (lat == null || lng == null) continue;
    const d = distanceMeters(latitude, longitude, lat, lng);
    if (d < bestD) {
      bestD = d;
      best = { place: p, distanceM: d };
    }
  }

  if (!best || best.distanceM > 3500) return null;

  return {
    placeId: extractPlaceId(best.place),
    displayName: best.place.displayName?.text || name,
    distanceM: Math.round(best.distanceM),
  };
}

async function main() {
  const { limit, dryRun, write } = parseArgs();

  if (!API_KEY) {
    console.error("Falta GOOGLE_PLACES_API_KEY en el entorno.");
    process.exit(1);
  }

  if (!fs.existsSync(ZONES_PATH)) {
    console.error("No existe:", ZONES_PATH);
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(ZONES_PATH, "utf8"));
  const zones = Array.isArray(cache.zones) ? cache.zones : [];
  const slice = Number.isFinite(limit) && limit > 0 ? zones.slice(0, limit) : zones;

  let existing = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
      if (typeof existing !== "object" || Array.isArray(existing)) existing = {};
    } catch {
      existing = {};
    }
  }

  const out = { ...existing };
  const log = [];

  for (let i = 0; i < slice.length; i += 1) {
    const z = slice[i];
    const id = z.id;
    const name = String(z.name || "").trim();
    if (!id || !name) continue;

    process.stdout.write(`[${i + 1}/${slice.length}] ${id} ${name}... `);

    try {
      const hit = await searchTextForZone(z);
      if (!hit) {
        console.log("sin coincidencia cercana");
        log.push({ id, name, ok: false, reason: "no_match" });
      } else {
        out[id] = hit.placeId;
        console.log(`→ ${hit.placeId} (${hit.distanceM} m) "${hit.displayName}"`);
        log.push({
          id,
          name,
          ok: true,
          placeId: hit.placeId,
          distanceM: hit.distanceM,
        });
      }
    } catch (e) {
      console.log("ERROR", e.message);
      log.push({ id, name, ok: false, error: e.message });
    }

    await sleep(350);
  }

  const summary = {
    total: slice.length,
    matched: log.filter((x) => x.ok).length,
    failed: log.filter((x) => !x.ok).length,
  };
  console.log("\nResumen:", summary);

  if (dryRun) {
    console.log("\n--dry-run: no se escribió archivo.");
    return;
  }

  if (write) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2), "utf8");
    console.log("Guardado:", OUTPUT_PATH);
  } else {
    console.log(
      "\nNo se escribió archivo. Añade --write para guardar data/park-google-place-ids.json"
    );
    const ok = log.filter((x) => x.ok);
    if (ok.length) {
      console.log("Coincidencias de esta corrida (muestra):");
      ok.slice(0, 12).forEach((x) => {
        console.log(`  ${x.id} → ${x.placeId}  (${x.distanceM} m)`);
      });
      if (ok.length > 12) console.log(`  ... y ${ok.length - 12} más`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
