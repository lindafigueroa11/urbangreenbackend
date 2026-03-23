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
  "jacaranda mimosifolia": "Jacaranda"
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
    const candidate = commonCandidates.find(
      (item) => typeof item === "string" && item.trim().length > 0
    );
    if (candidate) return candidate.trim();
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
      ...(Array.isArray(item?.details?.common_names)
        ? item.details.common_names
        : []),
      ...(Array.isArray(item?.details?.common_names_es)
        ? item.details.common_names_es
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

    const top = suggestions[0];
    return {
      label: top.label,
      scientific_name: top.scientific_name,
      plant_type: toPlantType(top.label),
      confidence: top.confidence,
      alternatives: suggestions.slice(1, 4),
      source: "plant.id"
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  classifyPlantImage
};
