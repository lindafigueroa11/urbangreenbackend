const DEFAULT_TIMEOUT_MS = 30000;
const fs = require("fs");
const path = require("path");
const PROVIDER_BASE_URL =
  process.env.PLANT_ID_BASE_URL || "https://plant.id/api/v3";
const LOCAL_COMMON_NAME_MAP = {
  "azadirachta indica": "Nim",
  "prosopis juliflora": "Mezquite",
  "prosopis glandulosa": "Mezquite",
  "prosopis velutina": "Mezquite",
  "parkinsonia florida": "Palo verde",
  "parkinsonia aculeata": "Palo verde",
  "olneya tesota": "Palo fierro",
  "ficus benjamina": "Laurel de la India",
  "bougainvillea glabra": "Bugambilia",
  "opuntia ficus-indica": "Nopal",
  "washingtonia robusta": "Palma abanico",
  "jacaranda mimosifolia": "Jacaranda",
  "delonix regia": "Flamboyán / Framboyán",
  "pithecellobium dulce": "Guamúchil",
  "leucaena leucocephala": "Guaje / Leucaena",
  "caesalpinia pulcherrima": "Ave de paraíso",
  "tabebuia impetiginosa": "Guayacán rosado",
  "handroanthus impetiginosus": "Guayacán rosado",
  "tecoma stans": "Tronadora / Chicalote",
  "strelitzia reginae": "Ave del paraíso",
  "nerium oleander": "Adelfa",
  "ligustrum japonicum": "Aligustre",
  "lagerstroemia indica": "Lila de las Indias",
  "melia azedarach": "Paraíso / Cinamomo",
  "plumeria rubra": "Frangipani / Cacalosúchil",
  "phoenix dactylifera": "Palma datilera",
  "citrus sinensis": "Naranjo",
  "citrus limon": "Limonero",
  "mangifera indica": "Mango",
  "persea americana": "Aguacate",
  "hibiscus rosa-sinensis": "Hibiscus / Tulipán australiano",
  "pelargonium x hortorum": "Geranio",
  "agave americana": "Agave / Maguey",
  "yucca elephantipes": "Yuca",
  "aloe vera": "Aloe / Sábila",
  "eucalyptus globulus": "Eucalipto",
  "fraxinus uhdei": "Fresno",
  "ulmus parvifolia": "Olmo",
  "taxodium mucronatum": "Ahuehuete",
  "psidium guajava": "Guayabo",
  "punica granatum": "Granado",
  "citrus reticulata": "Mandarino",
  "jasminum officinale": "Jazmín",
  "lavandula angustifolia": "Lavanda",
  "salvia rosmarinus": "Romero",
  "rosa spp.": "Rosal",
  "pinus spp.": "Pino",
  "quercus spp.": "Encino"
};
const DEFAULT_CATALOG_PATHS = [
  path.resolve(__dirname, "../data/especies.txt"),
  "C:/Users/amari/Downloads/especies.txt"
];
let catalogCache = null;

function getApiKey() {
  return (
    process.env.PLANT_ID_API_KEY ||
    process.env.PLANT_API_KEY ||
    process.env.PLANTNET_API_KEY ||
    ""
  );
}

function normalizeImageInput(imageBase64 = "", mimeType = "image/jpeg") {
  const value = String(imageBase64).trim();
  if (!value) return "";

  if (value.startsWith("data:image/")) {
    return value;
  }

  return `data:${mimeType};base64,${value}`;
}

function normalizeNameKey(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Heurística: binomio tipo "Género epíteto" sin indicios de nombre común en español.
 * Evita tomar como "común" un nombre que en realidad es científico.
 */
function looksLikeScientificName(s = "") {
  const t = String(s).trim();
  if (t.length < 5) return false;
  if (/\b(de|del|la|el|las|los|y|con|para)\b/i.test(t)) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return false;
  const [a, b] = parts;
  const genusLike = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(a);
  const epithetLike = /^[a-záéíóúñ][a-záéíóúñ0-9\-]*$/u.test(b);
  if (!genusLike || !epithetLike || b.length < 3) return false;
  if (/(oso|osa|ote|eta|illo|illa|ito|ita|aje|ejo|uje|ada|ido|ado|ura|ure)$/i.test(b))
    return false;
  return true;
}

function pickBestCommonName(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const strs = candidates
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean);
  for (const s of strs) {
    if (!looksLikeScientificName(s)) return s;
  }
  return strs[0] || null;
}

function parseCatalogText(raw = "") {
  // Permite cargar catálogos "casi JSON" con pequeños errores de comas/corchetes.
  const items = [];
  const regex =
    /"cientifico"\s*:\s*"([^"]+)"\s*,\s*"comun"\s*:\s*"([^"]+)"/gim;
  let match = regex.exec(raw);
  while (match) {
    const scientific = String(match[1] || "").trim();
    const common = String(match[2] || "").trim();
    if (scientific && common) {
      items.push({
        scientific_name: scientific,
        common_name: common
      });
    }
    match = regex.exec(raw);
  }
  return items;
}

function getCatalogMap() {
  if (catalogCache) return catalogCache;
  const targetPath =
    process.env.PLANT_CATALOG_PATH ||
    DEFAULT_CATALOG_PATHS.find((item) => fs.existsSync(item));
  try {
    if (!targetPath || !fs.existsSync(targetPath)) {
      catalogCache = {};
      return catalogCache;
    }
    const text = fs.readFileSync(targetPath, "utf-8");
    const rows = parseCatalogText(text);
    const map = {};
    for (const row of rows) {
      const key = normalizeNameKey(row.scientific_name);
      if (key && !map[key]) {
        map[key] = row.common_name;
      }
    }
    catalogCache = map;
    return catalogCache;
  } catch {
    catalogCache = {};
    return catalogCache;
  }
}

function readCustomMapFromEnv() {
  const raw = process.env.PLANT_LOCAL_NAME_MAP_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const normalized = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") continue;
      normalized[normalizeNameKey(key)] = value.trim();
    }
    return normalized;
  } catch {
    return {};
  }
}

function getLocalDisplayName({
  rawLabel = "",
  scientificName = "",
  commonCandidates = []
}) {
  const customMap = readCustomMapFromEnv();
  const catalogMap = getCatalogMap();
  const scientificKey = normalizeNameKey(scientificName);
  const rawLabelKey = normalizeNameKey(rawLabel);

  if (scientificKey && catalogMap[scientificKey]) return catalogMap[scientificKey];
  if (scientificKey && customMap[scientificKey]) return customMap[scientificKey];
  if (rawLabelKey && customMap[rawLabelKey]) return customMap[rawLabelKey];

  if (scientificKey && LOCAL_COMMON_NAME_MAP[scientificKey]) {
    return LOCAL_COMMON_NAME_MAP[scientificKey];
  }
  if (rawLabelKey && LOCAL_COMMON_NAME_MAP[rawLabelKey]) {
    return LOCAL_COMMON_NAME_MAP[rawLabelKey];
  }

  if (Array.isArray(commonCandidates) && commonCandidates.length > 0) {
    const picked = pickBestCommonName(commonCandidates);
    if (picked) return picked;
  }

  if (rawLabel && !looksLikeScientificName(rawLabel)) {
    return rawLabel;
  }

  return rawLabel || "Planta sin nombre comun";
}

function extractSuggestions(providerJson) {
  // plant.id v3 commonly returns "result.classification.suggestions"
  const root = providerJson?.result?.classification || providerJson?.classification;
  const suggestions = Array.isArray(root?.suggestions)
    ? root.suggestions
    : [];

  return suggestions.map((item) => {
    const scientificName =
      item?.details?.scientific_name ||
      item?.details?.taxonomy?.species ||
      item?.scientific_name ||
      null;
    const rawLabel = item?.name || item?.plant_name || item?.species || "Unknown";
    const commonCandidates = [
      ...(Array.isArray(item?.details?.common_names_es)
        ? item.details.common_names_es
        : []),
      ...(Array.isArray(item?.details?.common_names)
        ? item.details.common_names
        : []),
      item?.details?.local_name,
      item?.details?.common_name
    ].filter(Boolean);

    return {
      label: getLocalDisplayName({
        rawLabel,
        scientificName: scientificName || "",
        commonCandidates
      }),
      scientific_name: scientificName,
      confidence:
      typeof item?.probability === "number"
        ? item.probability
        : typeof item?.confidence === "number"
        ? item.confidence
        : null
    };
  });
}

async function resolveLabelWithLocalPlants(label, scientificName) {
  const plantModel = require("../src/models/plantModel");
  const sn = scientificName ? String(scientificName).trim() : "";
  const lb = label ? String(label).trim() : "";
  const tryNames = [];
  if (sn) tryNames.push(sn);
  if (lb && normalizeNameKey(lb) !== normalizeNameKey(sn)) tryNames.push(lb);

  for (const n of tryNames) {
    if (!n) continue;
    try {
      const row = await plantModel.findByName(n);
      if (row?.name) return String(row.name).trim();
    } catch {
      /* BD no disponible u otro error */
    }
  }
  return lb || sn || String(label || "").trim();
}

function toPlantType(label = "") {
  const value = String(label).toLowerCase();
  if (
    value.includes("tree") ||
    value.includes("arbol") ||
    value.includes("oak") ||
    value.includes("pine")
  ) {
    return "tree";
  }
  if (
    value.includes("cactus") ||
    value.includes("succulent") ||
    value.includes("suculenta")
  ) {
    return "succulent";
  }
  if (value.includes("shrub") || value.includes("arbusto")) {
    return "shrub";
  }
  return "plant";
}

async function classifyPlantImage({
  imageBase64,
  mimeType = "image/jpeg",
  language = "es"
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const error = new Error("PLANT_ID_API_KEY is not configured");
    error.statusCode = 503;
    throw error;
  }

  const image = normalizeImageInput(imageBase64, mimeType);
  if (!image) {
    const error = new Error("Image payload is empty");
    error.statusCode = 400;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${PROVIDER_BASE_URL}/identification?language=${encodeURIComponent(
        language
      )}`,
      {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          images: [image],
          similar_images: true
        }),
        signal: controller.signal
      }
    );

    const providerJson = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        providerJson?.message ||
          providerJson?.error ||
          `Plant provider error (${response.status})`
      );
      error.statusCode = response.status >= 500 ? 502 : 400;
      throw error;
    }

    const suggestions = extractSuggestions(providerJson);
    if (!suggestions.length) {
      const error = new Error("No plant classification candidates returned");
      error.statusCode = 422;
      throw error;
    }

    const enriched = await Promise.all(
      suggestions.map(async (s) => ({
        ...s,
        label: await resolveLabelWithLocalPlants(s.label, s.scientific_name),
      }))
    );

    const top = enriched[0];
    const typeHint = top.scientific_name || top.label;
    return {
      label: top.label,
      scientific_name: top.scientific_name,
      plant_type: toPlantType(typeHint),
      confidence: top.confidence,
      alternatives: enriched.slice(1, 4),
      source: "plant.id"
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  classifyPlantImage
};
