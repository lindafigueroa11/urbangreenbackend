const MAX_LABEL_LEN = 200;
const MAX_SCIENTIFIC_LEN = 240;
const MAX_MESSAGE_TEXT = 4000;
const MAX_MESSAGES = 32;
const MAX_WATERING_FIELD = 500;

function parseConversationId(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw) || raw <= 0) {
      return { error: "conversation_id inválido." };
    }
    return raw;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) {
      return { error: "conversation_id inválido." };
    }
    const n = Number(t);
    if (!Number.isSafeInteger(n) || n <= 0) {
      return { error: "conversation_id inválido." };
    }
    return n;
  }
  return { error: "conversation_id inválido." };
}

function parseLanguage(body) {
  const raw = body?.language;
  if (raw === undefined || raw === null) return "es";
  if (typeof raw !== "string") {
    return { error: "language debe ser texto" };
  }
  const v = raw.trim().slice(0, 12);
  if (!v) return "es";
  if (!/^[a-zA-Z]{2}([-_][a-zA-Z]{2})?$/.test(v)) {
    return { error: "Código de idioma no válido" };
  }
  return v.replace("_", "-").toLowerCase();
}

function parseInsights(raw) {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "insights debe ser un objeto" };
  }
  const pick = (k) => {
    const v = raw[k];
    if (v == null) return null;
    if (typeof v !== "string") return { error: `insights.${k} debe ser texto` };
    const t = v.trim();
    if (t.length > 8000) return { error: `insights.${k} demasiado largo` };
    return t || null;
  };
  const climate = pick("climate");
  if (typeof climate === "object" && climate.error) return climate;
  const watering = pick("watering");
  if (typeof watering === "object" && watering.error) return watering;
  const specialCare = pick("specialCare");
  if (typeof specialCare === "object" && specialCare.error) return specialCare;
  const disclaimer = pick("disclaimer");
  if (typeof disclaimer === "object" && disclaimer.error) return disclaimer;
  if (!climate && !watering && !specialCare && !disclaimer) return null;
  return { climate, watering, specialCare, disclaimer };
}

/**
 * @param {object} body
 * @returns {{ ok: true, language: string, context: object, messages: Array<{role: string, text: string}> } | { ok: false, status: number, error: string, code?: string }}
 */
function validatePlantChatPayload(body) {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      status: 400,
      error: "Body JSON requerido.",
      code: "INVALID_PAYLOAD",
    };
  }

  const lang = parseLanguage(body);
  if (typeof lang === "object" && lang.error) {
    return { ok: false, status: 400, error: lang.error, code: "INVALID_PAYLOAD" };
  }

  const ctx = body.context;
  if (!ctx || typeof ctx !== "object") {
    return {
      ok: false,
      status: 400,
      error: "Falta context u objeto inválido.",
      code: "INVALID_PAYLOAD",
    };
  }

  const labelRaw = ctx.label;
  if (labelRaw === undefined || labelRaw === null || typeof labelRaw !== "string") {
    return {
      ok: false,
      status: 400,
      error: "context.label es obligatorio y debe ser texto.",
      code: "INVALID_PAYLOAD",
    };
  }
  const label = labelRaw.trim();
  if (!label) {
    return {
      ok: false,
      status: 400,
      error: "context.label no puede estar vacío.",
      code: "INVALID_PAYLOAD",
    };
  }
  if (label.length > MAX_LABEL_LEN) {
    return {
      ok: false,
      status: 400,
      error: "context.label demasiado largo.",
      code: "INVALID_PAYLOAD",
    };
  }

  let scientific_name = null;
  if (ctx.scientific_name != null && ctx.scientific_name !== "") {
    if (typeof ctx.scientific_name !== "string") {
      return {
        ok: false,
        status: 400,
        error: "context.scientific_name debe ser texto.",
        code: "INVALID_PAYLOAD",
      };
    }
    const s = ctx.scientific_name.trim();
    if (s.length > MAX_SCIENTIFIC_LEN) {
      return {
        ok: false,
        status: 400,
        error: "context.scientific_name demasiado largo.",
        code: "INVALID_PAYLOAD",
      };
    }
    scientific_name = s || null;
  }

  const insightsParsed = parseInsights(ctx.insights);
  if (insightsParsed && typeof insightsParsed === "object" && insightsParsed.error) {
    return {
      ok: false,
      status: 400,
      error: insightsParsed.error,
      code: "INVALID_PAYLOAD",
    };
  }

  let watering_times = null;
  if (ctx.watering_times != null && ctx.watering_times !== "") {
    if (typeof ctx.watering_times !== "string") {
      return {
        ok: false,
        status: 400,
        error: "context.watering_times debe ser texto.",
        code: "INVALID_PAYLOAD",
      };
    }
    const w = ctx.watering_times.trim();
    if (w.length > MAX_WATERING_FIELD) {
      return {
        ok: false,
        status: 400,
        error: "context.watering_times demasiado largo.",
        code: "INVALID_PAYLOAD",
      };
    }
    watering_times = w || null;
  }

  let watering_note = null;
  if (ctx.watering_note != null && ctx.watering_note !== "") {
    if (typeof ctx.watering_note !== "string") {
      return {
        ok: false,
        status: 400,
        error: "context.watering_note debe ser texto.",
        code: "INVALID_PAYLOAD",
      };
    }
    const n = ctx.watering_note.trim();
    if (n.length > MAX_WATERING_FIELD) {
      return {
        ok: false,
        status: 400,
        error: "context.watering_note demasiado largo.",
        code: "INVALID_PAYLOAD",
      };
    }
    watering_note = n || null;
  }

  const context = {
    label,
    scientific_name,
    insights: insightsParsed,
    watering_times,
    watering_note,
  };

  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "messages debe ser un array no vacío.",
      code: "INVALID_PAYLOAD",
    };
  }
  if (msgs.length > MAX_MESSAGES) {
    return {
      ok: false,
      status: 400,
      error: `Demasiados mensajes (máx. ${MAX_MESSAGES}).`,
      code: "INVALID_PAYLOAD",
    };
  }

  const messages = [];
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    if (!m || typeof m !== "object") {
      return {
        ok: false,
        status: 400,
        error: `messages[${i}] inválido.`,
        code: "INVALID_PAYLOAD",
      };
    }
    const role = m.role;
    if (role !== "user" && role !== "model") {
      return {
        ok: false,
        status: 400,
        error: `messages[${i}].role debe ser "user" o "model".`,
        code: "INVALID_PAYLOAD",
      };
    }
    if (typeof m.text !== "string") {
      return {
        ok: false,
        status: 400,
        error: `messages[${i}].text debe ser texto.`,
        code: "INVALID_PAYLOAD",
      };
    }
    const text = m.text.trim();
    if (!text) {
      return {
        ok: false,
        status: 400,
        error: `messages[${i}].text no puede estar vacío.`,
        code: "INVALID_PAYLOAD",
      };
    }
    if (text.length > MAX_MESSAGE_TEXT) {
      return {
        ok: false,
        status: 400,
        error: `messages[${i}].text demasiado largo.`,
        code: "INVALID_PAYLOAD",
      };
    }
    messages.push({ role, text });
  }

  const last = messages[messages.length - 1];
  if (last.role !== "user") {
    return {
      ok: false,
      status: 400,
      error: "El último mensaje debe ser del usuario (role: user).",
      code: "INVALID_PAYLOAD",
    };
  }

  const conversationId = parseConversationId(body.conversation_id);
  if (typeof conversationId === "object" && conversationId.error) {
    return {
      ok: false,
      status: 400,
      error: conversationId.error,
      code: "INVALID_PAYLOAD",
    };
  }

  return {
    ok: true,
    language: lang,
    context,
    messages,
    conversation_id: conversationId,
  };
}

module.exports = { validatePlantChatPayload };
