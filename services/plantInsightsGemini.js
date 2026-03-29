const {
  buildPromptParts,
  parseInsightsJson,
  normalizeInsights,
} = require("./plantInsightsCommon");

const DEFAULT_TIMEOUT_MS = 45000;

function getApiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function getModel() {
  const m = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  return m || "gemini-2.5-flash";
}

function buildGeminiUrl(model, apiKey) {
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const encModel = encodeURIComponent(model);
  const encKey = encodeURIComponent(apiKey);
  return `${base}/models/${encModel}:generateContent?key=${encKey}`;
}

function buildBody(instruction, userPayload, useJsonMime) {
  const maxOut = (() => {
    const n = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
    if (Number.isFinite(n) && n >= 256 && n <= 8192) return Math.floor(n);
    return 2048;
  })();
  const gen = {
    temperature: 0.35,
    maxOutputTokens: maxOut,
  };
  if (useJsonMime) {
    gen.responseMimeType = "application/json";
  }
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: `${instruction}Datos:\n${userPayload}` }],
      },
    ],
    generationConfig: gen,
  };
}

/**
 * @param {{ label: string, scientific_name: string | null, language: string }} input
 */
async function generatePlantInsightsGemini(input) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY no configurada en el servidor.");
    err.statusCode = 503;
    err.code = "INSIGHTS_UNAVAILABLE";
    throw err;
  }

  const { instruction, userPayload } = buildPromptParts(input);

  const primary = getModel();
  const modelFallbacks = [
    primary,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  async function oneRequest(model, useJsonMime) {
    const url = buildGeminiUrl(model, apiKey);
    const body = buildBody(instruction, userPayload, useJsonMime);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      const err = new Error("Respuesta inválida del proveedor IA (Gemini).");
      err.statusCode = 502;
      throw err;
    }
    return { res, data };
  }

  let lastErrMsg = "";

  try {
    for (const model of modelFallbacks) {
      for (const useJsonMime of [true, false]) {
        let res;
        let data;
        try {
          ({ res, data } = await oneRequest(model, useJsonMime));
        } catch (e) {
          if (e.statusCode) throw e;
          throw e;
        }

        if (!res.ok) {
          const msg =
            data?.error?.message ||
            data?.message ||
            `Gemini HTTP ${res.status}`;
          lastErrMsg = msg;
          const retryable =
            res.status === 404 ||
            res.status === 400 ||
            (res.status >= 500 && res.status < 600);
          if (retryable && useJsonMime) {
            continue;
          }
          if (retryable && !useJsonMime) {
            break;
          }
          const err = new Error(msg);
          err.statusCode = res.status === 429 ? 429 : 502;
          throw err;
        }

        const candidate = data?.candidates?.[0];
        const finishReason = candidate?.finishReason;
        if (!candidate?.content?.parts?.length) {
          lastErrMsg = data?.promptFeedback?.blockReason || "Sin partes en la respuesta";
          if (useJsonMime) continue;
          break;
        }

        const content = candidate.content.parts
          .map((p) => (typeof p?.text === "string" ? p.text : ""))
          .join("")
          .trim();

        if (!content) {
          lastErrMsg = "Texto vacío";
          if (useJsonMime) continue;
          break;
        }

        let parsed;
        try {
          parsed = parseInsightsJson(content);
        } catch {
          if (useJsonMime) {
            continue;
          }
          lastErrMsg = "El modelo no devolvió JSON válido.";
          break;
        }

        if (finishReason === "SAFETY") {
          const err = new Error(
            "Respuesta filtrada por seguridad; prueba con otro nombre de planta."
          );
          err.statusCode = 502;
          throw err;
        }

        return normalizeInsights(parsed);
      }
    }

    const err = new Error(
      lastErrMsg || "No se pudo obtener JSON del modelo. Revisa GEMINI_API_KEY y GEMINI_MODEL."
    );
    err.statusCode = 502;
    throw err;
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("Tiempo de espera agotado al generar información.");
      err.statusCode = 504;
      throw err;
    }
    if (e.statusCode) throw e;
    const err = new Error(e.message || "Error al contactar Google Gemini.");
    err.statusCode = 502;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { generatePlantInsightsGemini };
