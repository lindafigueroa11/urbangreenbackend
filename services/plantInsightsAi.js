const DEFAULT_TIMEOUT_MS = 28000;

function getApiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function getModel() {
  const m = String(process.env.GEMINI_MODEL || "gemini-1.5-flash").trim();
  return m || "gemini-1.5-flash";
}

function buildGeminiUrl(model, apiKey) {
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const encModel = encodeURIComponent(model);
  const encKey = encodeURIComponent(apiKey);
  return `${base}/models/${encModel}:generateContent?key=${encKey}`;
}

/**
 * Extrae JSON aunque Gemini envíe bloques ```json ... ``` o texto extra.
 */
function parseJsonFromGeminiText(text) {
  const raw = String(text).trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/m;
  const m = raw.match(fence);
  const inner = m ? m[1].trim() : raw;
  return JSON.parse(inner);
}

/**
 * Genera notas orientativas (clima, riego, cuidados) vía Google Gemini.
 * Requiere GEMINI_API_KEY (Google AI Studio).
 *
 * @param {{ label: string, scientific_name: string | null, language: string }} input
 * @returns {Promise<{ climate: string, watering: string, specialCare: string, disclaimer: string }>}
 */
async function generatePlantInsights(input) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY no configurada en el servidor.");
    err.statusCode = 503;
    err.code = "INSIGHTS_UNAVAILABLE";
    throw err;
  }

  const label = String(input.label || "").trim();
  const scientific = input.scientific_name
    ? String(input.scientific_name).trim()
    : "";
  const language = String(input.language || "es").trim().slice(0, 12) || "es";

  const primaryModel = getModel();
  /** Si el modelo configurado falla (404), probar alternativas estables. */
  const modelFallbacks = [
    primaryModel,
    "gemini-1.5-flash",
    "gemini-2.0-flash",
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  const instruction =
    "Eres un asistente de jardinería y botánica aplicada. " +
    "Responde SOLO con un objeto JSON válido con las claves exactas: " +
    '"climate", "watering", "specialCare", "disclaimer". ' +
    "Todos los textos deben estar en el idioma indicado por el usuario. " +
    "climate: 2-4 frases sobre climas/zonas donde suele cultivarse y rangos de temperatura generales. " +
    "watering: 2-4 frases sobre frecuencia de riego y señales de sed o exceso (orientativo). " +
    "specialCare: 3-6 líneas o viñetas sobre luz, suelo, poda, plagas comunes o precauciones. " +
    "disclaimer: una frase corta de que la información es general y debe adaptarse al clima local.\n\n";

  const userPayload = JSON.stringify({
    language,
    common_name: label,
    scientific_name: scientific || null,
    task: "Devuelve solo el JSON con los cuatro campos para esta especie.",
  });

  /** Un solo mensaje de usuario evita incompatibilidades con systemInstruction + JSON mode. */
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${instruction}Datos:\n${userPayload}` }],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 900,
      responseMimeType: "application/json",
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let lastHttpError = null;

  try {
    for (const model of modelFallbacks) {
      const url = buildGeminiUrl(model, apiKey);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

      if (!res.ok) {
        const msg =
          data?.error?.message ||
          data?.message ||
          `Gemini HTTP ${res.status}`;
        lastHttpError = { status: res.status, msg };
        if (res.status === 404 && modelFallbacks.indexOf(model) < modelFallbacks.length - 1) {
          continue;
        }
        const err = new Error(msg);
        err.statusCode = res.status === 429 ? 429 : 502;
        throw err;
      }

      const candidate = data?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (!candidate?.content?.parts?.length) {
        const err = new Error(
          data?.promptFeedback?.blockReason
            ? "La solicitud fue bloqueada por políticas de seguridad."
            : "Respuesta vacía del modelo Gemini."
        );
        err.statusCode = 502;
        if (finishReason === "SAFETY") {
          err.message =
            "Respuesta filtrada por seguridad; prueba con otro nombre de planta.";
        }
        throw err;
      }

      const content = candidate.content.parts
        .map((p) => (typeof p?.text === "string" ? p.text : ""))
        .join("")
        .trim();

      if (!content) {
        const err = new Error("Respuesta vacía del modelo.");
        err.statusCode = 502;
        throw err;
      }

      let parsed;
      try {
        parsed = parseJsonFromGeminiText(content);
      } catch {
        const err = new Error("El modelo no devolvió JSON válido.");
        err.statusCode = 502;
        throw err;
      }

      return normalizeInsights(parsed);
    }

    const err = new Error(
      lastHttpError?.msg || "No se pudo contactar a Gemini con los modelos disponibles."
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

function normalizeInsights(obj) {
  const climate = safeText(obj?.climate);
  const watering = safeText(obj?.watering);
  let specialCare = safeText(obj?.specialCare);
  if (Array.isArray(obj?.specialCare)) {
    specialCare = obj.specialCare.map((x) => safeText(x)).filter(Boolean).join("\n");
  }
  const disclaimer = safeText(obj?.disclaimer);
  return {
    climate: climate || "Sin datos.",
    watering: watering || "Sin datos.",
    specialCare: specialCare || "Sin datos.",
    disclaimer:
      disclaimer ||
      "Información orientativa; adapta riego y cuidados a tu clima y sustrato.",
  };
}

function safeText(v) {
  if (v == null) return "";
  return String(v).trim();
}

module.exports = { generatePlantInsights };
