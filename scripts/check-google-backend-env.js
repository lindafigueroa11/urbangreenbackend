/**
 * Comprueba que .env tenga GOOGLE_WEB_CLIENT_ID (mismo valor que EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en la app).
 * Uso: node scripts/check-google-backend-env.js
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");

function parseEnv(content) {
  const out = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    out[k] = v;
  }
  return out;
}

function main() {
  if (!fs.existsSync(envPath)) {
    console.error(
      "[check-google-backend-env] Falta .env. Copia .env.example y rellena valores."
    );
    process.exit(1);
  }

  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  const key = "GOOGLE_WEB_CLIENT_ID";
  const v = env[key];
  if (!v || !String(v).trim()) {
    console.error(
      `[check-google-backend-env] Falta o está vacía: ${key}\n` +
        "  Debe coincidir con EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en la app. Ver README / .env.example."
    );
    process.exit(1);
  }

  console.log("[check-google-backend-env] OK:", key, "definido.");
}

main();
