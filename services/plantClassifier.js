const DEFAULT_TIMEOUT_MS = 30000;
const PROVIDER_BASE_URL =
  process.env.PLANT_ID_BASE_URL || "https://plant.id/api/v3";

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

function extractSuggestions(providerJson) {
  // plant.id v3 commonly returns "result.classification.suggestions"
  const root = providerJson?.result?.classification || providerJson?.classification;
  const suggestions = Array.isArray(root?.suggestions)
    ? root.suggestions
    : [];

  return suggestions.map((item) => ({
    label: item?.name || item?.plant_name || item?.species || "Unknown",
    scientific_name:
      item?.details?.scientific_name ||
      item?.details?.taxonomy?.species ||
      item?.scientific_name ||
      null,
    confidence:
      typeof item?.probability === "number"
        ? item.probability
        : typeof item?.confidence === "number"
        ? item.confidence
        : null
  }));
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
