/**
 * Borra data/hermosillo-green-zones.json (y memoria solo en este proceso).
 * Con el API en marcha, para forzar Overpass+externas usa refresh=true en HTTP;
 * o reinicia el servidor tras ejecutar esto.
 * Uso: npm run invalidate-green-zones-cache
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const cacheFilePath = path.join(__dirname, "../data/hermosillo-green-zones.json");
try {
  if (fs.existsSync(cacheFilePath)) {
    fs.unlinkSync(cacheFilePath);
    console.log("Archivo de caché en disco eliminado:", cacheFilePath);
  } else {
    console.log("No había archivo de caché en disco.");
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}
