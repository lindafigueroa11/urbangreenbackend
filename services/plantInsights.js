const { generatePlantInsightsGemini } = require("./plantInsightsGemini");
const { generatePlantInsightsOllama } = require("./plantInsightsOllama");

/**
 * Proveedor de notas de planta:
 * - PLANT_INSIGHTS_PROVIDER=ollama  -> Ollama (OLLAMA_BASE_URL obligatoria)
 * - PLANT_INSIGHTS_PROVIDER=gemini  -> Gemini (GEMINI_API_KEY)
 * - Sin variable explícita:
 *   - Solo GEMINI_API_KEY -> Gemini
 *   - Solo OLLAMA_BASE_URL -> Ollama
 *   - Ambas definidas -> Gemini (evita que una URL de prueba de Ollama anule Gemini)
 *   - Ninguna -> intenta Gemini (fallará con 503 si falta clave)
 */
function resolveProvider() {
  const explicit = String(process.env.PLANT_INSIGHTS_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (explicit === "ollama") return "ollama";
  if (explicit === "gemini") return "gemini";

  const hasGemini = Boolean(String(process.env.GEMINI_API_KEY || "").trim());
  const hasOllama = Boolean(String(process.env.OLLAMA_BASE_URL || "").trim());

  if (hasGemini && !hasOllama) return "gemini";
  if (hasOllama && !hasGemini) return "ollama";
  if (hasGemini && hasOllama) return "gemini";

  return "gemini";
}

/**
 * @param {{ label: string, scientific_name: string | null, language: string }} input
 */
async function generatePlantInsights(input) {
  const provider = resolveProvider();
  if (provider === "ollama") {
    return generatePlantInsightsOllama(input);
  }
  return generatePlantInsightsGemini(input);
}

module.exports = { generatePlantInsights, resolveProvider };
