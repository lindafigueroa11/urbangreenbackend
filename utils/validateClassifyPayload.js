const _maxEnv = Number(process.env.CLASSIFY_MAX_IMAGE_BYTES);
const MAX_DECODED_BYTES =
  Number.isFinite(_maxEnv) && _maxEnv > 0 ? _maxEnv : 6 * 1024 * 1024;
const _minEnv = Number(process.env.CLASSIFY_MIN_IMAGE_BYTES);
const MIN_DECODED_BYTES =
  Number.isFinite(_minEnv) && _minEnv >= 0 ? _minEnv : 200;
const MAX_BASE64_CHARS = Math.ceil((MAX_DECODED_BYTES * 4) / 3) + 8;

const ALLOWED_MIME_NORMALIZED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function normalizeMime(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (raw === "image/jpg") return "image/jpeg";
  return raw;
}

function approxDecodedBase64Length(cleanBase64) {
  const len = cleanBase64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (cleanBase64[len - 1] === "=") padding++;
  if (len >= 2 && cleanBase64[len - 2] === "=") padding++;
  return Math.floor((len * 3) / 4) - padding;
}

function isPlausibleBase64(s) {
  const clean = s.replace(/\s/g, "");
  if (clean.length === 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(clean);
}

function parseLanguage(body) {
  const raw = body?.language;
  if (raw === undefined || raw === null) return "es";
  if (typeof raw !== "string") {
    return { error: "language must be a string" };
  }
  const v = raw.trim().slice(0, 12);
  if (!v) return "es";
  if (!/^[a-zA-Z]{2}([-_][a-zA-Z]{2})?$/.test(v)) {
    return { error: "Invalid language code" };
  }
  return v.toLowerCase().replace("_", "-").split("-")[0];
}

/**
 * Valida tamaño, mime y forma del payload antes de llamar al clasificador.
 * @returns {{ ok: true, imageBase64: string, mimeType: string, language: string } | { ok: false, status: number, error: string, details?: string }}
 */
function validateClassifyPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid request body",
      details: "Se espera un objeto JSON.",
    };
  }

  const imageField =
    body.image_base64 ?? body.imageBase64 ?? body.image;

  if (imageField === undefined || imageField === null) {
    return {
      ok: false,
      status: 400,
      error: "image_base64 is required",
    };
  }

  if (typeof imageField !== "string") {
    return {
      ok: false,
      status: 400,
      error: "image_base64 must be a string",
    };
  }

  const trimmed = imageField.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 400,
      error: "image_base64 is empty",
    };
  }

  let mimeFromDataUrl = null;
  let rawBase64 = trimmed;

  if (trimmed.startsWith("data:")) {
    const comma = trimmed.indexOf(",");
    if (comma === -1) {
      return {
        ok: false,
        status: 400,
        error: "Invalid data URL",
        details: "Falta la parte base64 tras la coma.",
      };
    }
    const header = trimmed.slice(5, comma);
    const declared = header.split(";")[0].trim();
    mimeFromDataUrl = normalizeMime(declared);
    rawBase64 = trimmed.slice(comma + 1);
  }

  const bodyMime = normalizeMime(
    body.mimeType ?? body.mime_type ?? "image/jpeg"
  );
  const effectiveMime = mimeFromDataUrl || bodyMime;

  if (!ALLOWED_MIME_NORMALIZED.has(effectiveMime)) {
    return {
      ok: false,
      status: 400,
      error: "Unsupported image type",
      details: `mimeType permitidos: image/jpeg, image/png, image/webp. Recibido: ${effectiveMime || "(vacío)"}`,
    };
  }

  const cleanB64 = rawBase64.replace(/\s/g, "");
  if (cleanB64.length > MAX_BASE64_CHARS) {
    return {
      ok: false,
      status: 413,
      error: "Image payload too large",
      details: `El base64 supera el máximo permitido (${MAX_DECODED_BYTES} bytes decodificados aprox.).`,
    };
  }

  if (!isPlausibleBase64(cleanB64)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid base64",
      details: "El contenido no parece base64 válido.",
    };
  }

  const decodedApprox = approxDecodedBase64Length(cleanB64);
  if (decodedApprox > MAX_DECODED_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Image too large",
      details: "La imagen decodificada supera el tamaño máximo permitido.",
    };
  }

  if (decodedApprox < MIN_DECODED_BYTES) {
    return {
      ok: false,
      status: 400,
      error: "Image payload too small",
      details: "La imagen es demasiado pequeña o el base64 está incompleto.",
    };
  }

  const langResult = parseLanguage(body);
  if (typeof langResult === "object" && langResult.error) {
    return {
      ok: false,
      status: 400,
      error: langResult.error,
    };
  }

  return {
    ok: true,
    imageBase64: trimmed,
    mimeType: effectiveMime,
    language: langResult,
  };
}

module.exports = {
  validateClassifyPayload,
  MAX_DECODED_BYTES,
  MIN_DECODED_BYTES,
  ALLOWED_MIME_NORMALIZED,
};
