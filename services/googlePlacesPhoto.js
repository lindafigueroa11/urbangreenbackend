/**
 * Fotos de lugares vía Places API (nuevo) — equivalente HTTP al flujo de
 * https://developers.google.com/maps/documentation/places/android-sdk/place-photos
 *
 * Requiere: GOOGLE_PLACES_API_KEY en el entorno y "Places API (New)" activada en Google Cloud.
 */

const PLACES_HOST = "https://places.googleapis.com/v1";

const memoryCache = new Map();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

function cacheGet(key) {
  const e = memoryCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return e;
}

function cacheSet(key, value) {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const first = memoryCache.keys().next().value;
    memoryCache.delete(first);
  }
  memoryCache.set(key, { ...value, ts: Date.now() });
}

/**
 * Descarga la foto "photoIndex" (0-based) de un Place usando Places API (New).
 * @param {string} placeId - Ej. ChIJ... (Place ID de Google)
 * @param {number} maxWidthPx
 * @param {number} photoIndex
 * @returns {Promise<{ buffer: Buffer, contentType: string, attributions?: string } | null>}
 */
async function fetchPlacePhotoBuffer(
  placeId,
  maxWidthPx = 800,
  photoIndex = 0
) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !String(placeId).trim()) {
    throw new Error("GOOGLE_PLACES_API_KEY or placeId missing");
  }

  const cacheKey = `${placeId}:${maxWidthPx}:${photoIndex}`;
  const hit = cacheGet(cacheKey);
  if (hit) {
    return {
      buffer: hit.buffer,
      contentType: hit.contentType,
      attributions: hit.attributions,
    };
  }

  const id = encodeURIComponent(String(placeId).trim());
  const detailsRes = await fetch(`${PLACES_HOST}/places/${id}`, {
    headers: {
      "X-Goog-FieldMask": "photos",
      "X-Goog-Api-Key": key,
    },
  });

  if (!detailsRes.ok) {
    const text = await detailsRes.text();
    const err = new Error(`Place details failed: ${detailsRes.status} ${text}`);
    err.statusCode = detailsRes.status === 404 ? 404 : 502;
    throw err;
  }

  const details = await detailsRes.json();
  const photos = details?.photos;
  if (!Array.isArray(photos) || photos.length === 0) {
    return null;
  }

  const index = Number.isFinite(Number(photoIndex)) ? Number(photoIndex) : 0;
  const photo = photos[index];
  const photoName = photo?.name;
  if (!photoName) return null;

  const mediaUrl = `${PLACES_HOST}/${photoName}/media?maxWidthPx=${encodeURIComponent(
    String(maxWidthPx)
  )}`;

  const imgRes = await fetch(mediaUrl, {
    headers: { "X-Goog-Api-Key": key },
  });

  if (!imgRes.ok) {
    const text = await imgRes.text();
    const err = new Error(`Photo media failed: ${imgRes.status} ${text}`);
    err.statusCode = 502;
    throw err;
  }

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";

  let attributions = "";
  const a = photo?.authorAttributions;
  if (Array.isArray(a) && a.length > 0) {
    attributions = a
      .map((x) => x?.displayName || x?.uri || "")
      .filter(Boolean)
      .join(" · ");
  }

  cacheSet(cacheKey, { buffer, contentType, attributions });

  return { buffer, contentType, attributions: attributions || undefined };
}

/**
 * Devuelve cuántas fotos (photos) existen para un Place ID.
 * @param {string} placeId
 * @returns {Promise<{ count: number, attributions?: string }>}
 */
async function fetchPlacePhotoCount(placeId) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !String(placeId).trim()) {
    throw new Error("GOOGLE_PLACES_API_KEY or placeId missing");
  }

  const cacheKey = `${placeId}:photoCount`;
  const hit = cacheGet(cacheKey);
  if (hit) return { count: hit.count, attributions: hit.attributions };

  const id = encodeURIComponent(String(placeId).trim());
  const detailsRes = await fetch(`${PLACES_HOST}/places/${id}`, {
    headers: {
      "X-Goog-FieldMask": "photos",
      "X-Goog-Api-Key": key,
    },
  });

  if (!detailsRes.ok) {
    const text = await detailsRes.text();
    const err = new Error(`Place details failed: ${detailsRes.status} ${text}`);
    err.statusCode = detailsRes.status === 404 ? 404 : 502;
    throw err;
  }

  const details = await detailsRes.json();
  const photos = details?.photos;
  const count = Array.isArray(photos) ? photos.length : 0;

  let attributions = "";
  const photo0 = Array.isArray(photos) ? photos[0] : null;
  const a = photo0?.authorAttributions;
  if (Array.isArray(a) && a.length > 0) {
    attributions = a
      .map((x) => x?.displayName || x?.uri || "")
      .filter(Boolean)
      .join(" · ");
  }

  cacheSet(cacheKey, { count, attributions });
  return { count, attributions: attributions || undefined };
}

module.exports = { fetchPlacePhotoBuffer, fetchPlacePhotoCount };
