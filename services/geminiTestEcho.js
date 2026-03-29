const DEFAULT_TIMEOUT_MS = 120000;

function getMaxOutputTokens() {
  const n = Number(process.env.GEMINI_TEST_MAX_OUTPUT_TOKENS);
  if (Number.isFinite(n) && n >= 256 && n <= 8192) return Math.floor(n);
  return 4096;
}

function getApiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function getModel() {
  const m = String(
    process.env.GEMINI_TEST_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash"
  ).trim();
  return m || "gemini-2.5-flash";
}

/**
 * Prueba de conectividad con Gemini (un solo turno usuario).
 * @param {{ message: string }} input
 * @returns {Promise<{ reply: string, model: string }>}
 */
async function geminiTestEcho(input) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY no configurada en el servidor.");
    err.statusCode = 503;
    err.code = "GEMINI_KEY_MISSING";
    throw err;
  }

  const message = String(input.message ?? "").trim();
  if (!message) {
    const err = new Error("Falta el campo message en el body.");
    err.statusCode = 400;
    throw err;
  }
  if (message.length > 8000) {
    const err = new Error("message demasiado largo (máx. 8000 caracteres).");
    err.statusCode = 400;
    throw err;
  }

  const model = getModel();
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: message }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: getMaxOutputTokens(),
        },
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      const err = new Error("Respuesta no JSON del servidor de Gemini.");
      err.statusCode = 502;
      throw err;
    }

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `Gemini HTTP ${res.status}`;
      const err = new Error(msg);
      err.statusCode = res.status === 429 ? 429 : 502;
      err.geminiRaw = data?.error;
      throw err;
    }

    const cand = data?.candidates?.[0];
    const text =
      cand?.content?.parts
        ?.map((p) => (typeof p?.text === "string" ? p.text : ""))
        .join("")
        .trim() || "";

    const finishReason = cand?.finishReason || null;
    const truncated = finishReason === "MAX_TOKENS";

    return {
      reply: text || "(respuesta vacía)",
      model,
      ...(truncated ? { warning: "Respuesta limitada por maxOutputTokens; sube GEMINI_TEST_MAX_OUTPUT_TOKENS si hace falta." } : {}),
      ...(finishReason ? { finishReason } : {}),
    };
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("Tiempo de espera agotado al llamar a Gemini.");
      err.statusCode = 504;
      throw err;
    }
    if (e.statusCode) throw e;
    const err = new Error(e.message || "Error al contactar Gemini.");
    err.statusCode = 502;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { geminiTestEcho };
