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

/**
 * @param {object} body
 * @returns {{ ok: true, label: string, scientific_name: string | null, language: string } | { ok: false, status: number, error: string }}
 */
function validatePlantInsightsPayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "Body JSON requerido." };
  }

  const labelRaw = body.label;
  if (labelRaw === undefined || labelRaw === null) {
    return { ok: false, status: 400, error: "Falta label." };
  }
  if (typeof labelRaw !== "string") {
    return { ok: false, status: 400, error: "label debe ser texto." };
  }
  const label = labelRaw.trim();
  if (!label) {
    return { ok: false, status: 400, error: "label no puede estar vacío." };
  }
  if (label.length > 200) {
    return { ok: false, status: 400, error: "label demasiado largo." };
  }

  let scientific_name = null;
  if (body.scientific_name != null && body.scientific_name !== "") {
    if (typeof body.scientific_name !== "string") {
      return { ok: false, status: 400, error: "scientific_name debe ser texto." };
    }
    const s = body.scientific_name.trim();
    if (s.length > 240) {
      return { ok: false, status: 400, error: "scientific_name demasiado largo." };
    }
    scientific_name = s || null;
  }

  const lang = parseLanguage(body);
  if (typeof lang === "object" && lang.error) {
    return { ok: false, status: 400, error: lang.error };
  }

  return {
    ok: true,
    label,
    scientific_name,
    language: lang,
  };
}

module.exports = { validatePlantInsightsPayload };
