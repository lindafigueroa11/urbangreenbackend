const DEFAULT_TIMEOUT_MS = 60000;
const MAX_HISTORY_MESSAGES = 24;

function getApiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function getModel() {
  const m = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  return m || "gemini-2.5-flash";
}

function getMaxOutputTokens() {
  const n = Number(
    process.env.GEMINI_CHAT_MAX_OUTPUT_TOKENS || process.env.GEMINI_MAX_OUTPUT_TOKENS
  );
  if (Number.isFinite(n) && n >= 256 && n <= 8192) return Math.floor(n);
  return 2048;
}

function buildGeminiUrl(model, apiKey) {
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const encModel = encodeURIComponent(model);
  const encKey = encodeURIComponent(apiKey);
  return `${base}/models/${encModel}:generateContent?key=${encKey}`;
}

function buildSystemInstructionText({ language, context }) {
  const lines = [
    "Eres un asistente de jardinería y botánica aplicada.",
    `Responde siempre en el idioma indicado (código: ${language}).`,
    "Ámbito: solo la planta descrita en el contexto del análisis. Si preguntan algo no relacionado, redirige con cortesía al cuidado de esa planta.",
    "Sé claro y práctico. Si no estás seguro, dilo y sugiere consultar un experto local o vivero.",
    "",
    "--- Contexto del análisis ---",
    `Nombre común: ${context.label}`,
  ];
  if (context.scientific_name) {
    lines.push(`Nombre científico: ${context.scientific_name}`);
  }
  if (context.watering_times || context.watering_note) {
    lines.push("Riego (orientativo, desde la app):");
    if (context.watering_times) lines.push(`- Frecuencia sugerida: ${context.watering_times}`);
    if (context.watering_note) lines.push(`- Nota: ${context.watering_note}`);
  }
  if (context.insights) {
    const ins = context.insights;
    lines.push("");
    lines.push("Notas IA previas (resumen):");
    if (ins.climate) lines.push(`Clima/zona: ${ins.climate}`);
    if (ins.watering) lines.push(`Riego (notas): ${ins.watering}`);
    if (ins.specialCare) lines.push(`Cuidados: ${ins.specialCare}`);
    if (ins.disclaimer) lines.push(`Aviso: ${ins.disclaimer}`);
  }
  lines.push("--- Fin contexto ---");
  return lines.join("\n");
}

function trimMessages(messages) {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
}

function extractReplyText(data) {
  const cand = data?.candidates?.[0];
  return (
    cand?.content?.parts
      ?.map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim() || ""
  );
}

/**
 * @param {{ language: string, context: object, messages: Array<{role: string, text: string}> }} input
 * @returns {Promise<{ reply: string, model: string, warning?: string, finishReason?: string | null }>}
 */
async function generatePlantChatReply(input) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY no configurada en el servidor.");
    err.statusCode = 503;
    err.code = "CHAT_UNAVAILABLE";
    throw err;
  }

  const model = getModel();
  const url = buildGeminiUrl(model, apiKey);
  const systemText = buildSystemInstructionText(input);
  const trimmed = trimMessages(input.messages);
  const contents = toGeminiContents(trimmed);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemText }],
        },
        contents,
        generationConfig: {
          temperature: 0.45,
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
      const err = new Error("Respuesta inválida del proveedor IA (Gemini).");
      err.statusCode = 502;
      throw err;
    }

    if (!res.ok) {
      const msg =
        data?.error?.message || data?.message || `Gemini HTTP ${res.status}`;
      const err = new Error(msg);
      err.statusCode = res.status === 429 ? 429 : 502;
      err.geminiRaw = data?.error;
      throw err;
    }

    const reply = extractReplyText(data);
    const cand = data?.candidates?.[0];
    const finishReason = cand?.finishReason || null;
    const truncated = finishReason === "MAX_TOKENS";

    return {
      reply: reply || "(respuesta vacía)",
      model,
      ...(truncated
        ? {
            warning:
              "Respuesta posiblemente truncada; el usuario puede acortar la pregunta o intentar de nuevo.",
            finishReason,
          }
        : finishReason
          ? { finishReason }
          : {}),
    };
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("Tiempo de espera agotado al llamar a Gemini.");
      err.statusCode = 504;
      err.code = "CHAT_TIMEOUT";
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

module.exports = { generatePlantChatReply };
