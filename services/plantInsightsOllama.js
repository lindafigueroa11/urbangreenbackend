const {
  buildFullPrompt,
  parseInsightsJson,
  normalizeInsights,
} = require("./plantInsightsCommon");

const DEFAULT_TIMEOUT_MS = 120000;

function getOllamaBaseUrl() {
  return String(process.env.OLLAMA_BASE_URL || "").trim().replace(/\/$/, "");
}

function getOllamaModel() {
  const m = String(process.env.OLLAMA_MODEL || "llama3.2:3b").trim();
  return m || "llama3.2:3b";
}

/**
 * Notas de planta vía Ollama (POST /api/generate).
 * Requiere OLLAMA_BASE_URL apuntando al servicio Ollama (p. ej. otro Web Service en Render).
 *
 * @param {{ label: string, scientific_name: string | null, language: string }} input
 */
async function generatePlantInsightsOllama(input) {
  const base = getOllamaBaseUrl();
  if (!base) {
    const err = new Error("OLLAMA_BASE_URL no configurada en el servidor.");
    err.statusCode = 503;
    err.code = "INSIGHTS_UNAVAILABLE";
    throw err;
  }

  const model = getOllamaModel();
  const prompt = buildFullPrompt(input);
  const url = `${base}/api/generate`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const headers = {
    "Content-Type": "application/json",
  };
  const extraAuth = String(process.env.OLLAMA_API_KEY || "").trim();
  if (extraAuth) {
    headers.Authorization = `Bearer ${extraAuth}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
        options: {
          temperature: 0.35,
          num_predict: 900,
        },
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      const err = new Error("Respuesta inválida de Ollama.");
      err.statusCode = 502;
      throw err;
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || `Ollama HTTP ${res.status}`;
      const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      err.statusCode = res.status === 429 ? 429 : 502;
      throw err;
    }

    const responseText = typeof data?.response === "string" ? data.response.trim() : "";
    if (!responseText) {
      const err = new Error("Ollama devolvió respuesta vacía.");
      err.statusCode = 502;
      throw err;
    }

    let parsed;
    try {
      parsed = parseInsightsJson(responseText);
    } catch {
      const err = new Error("El modelo no devolvió JSON válido.");
      err.statusCode = 502;
      throw err;
    }

    return normalizeInsights(parsed);
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("Tiempo de espera agotado al generar información (Ollama).");
      err.statusCode = 504;
      throw err;
    }
    if (e.statusCode) throw e;
    const err = new Error(e.message || "Error al contactar Ollama.");
    err.statusCode = 502;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { generatePlantInsightsOllama };
