const PUBLIC_ID_PREFIX = "UG";
const PUBLIC_ID_BODY_LEN = 12;
const PUBLIC_ID_REGEX = /^UG[0-9A-Z]{12}$/;

function toPublicDeviceId(internalId) {
  const n = Number(internalId);
  if (!Number.isInteger(n) || n < 1) return null;
  const body = n.toString(36).toUpperCase().padStart(PUBLIC_ID_BODY_LEN, "0");
  return `${PUBLIC_ID_PREFIX}${body}`;
}

function toInternalDeviceId(rawId) {
  const value = String(rawId ?? "").trim().toUpperCase();
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  }

  if (!PUBLIC_ID_REGEX.test(value)) return null;
  const numeric = parseInt(value.slice(PUBLIC_ID_PREFIX.length), 36);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function isPublicDeviceId(rawId) {
  return PUBLIC_ID_REGEX.test(String(rawId ?? "").trim().toUpperCase());
}

module.exports = {
  toPublicDeviceId,
  toInternalDeviceId,
  isPublicDeviceId,
};
