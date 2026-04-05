/**
 * Envía POST /sensor-data/simulate para probar el backend sin ESP32.
 *
 * Uso:
 *   set API_BASE_URL=http://localhost:3000
 *   set SIM_DEVICE_ID=1
 *   npm run simulate:sensor
 *
 * O: node -r dotenv/config scripts/simulate-sensor-data.js <device_id>
 */

const base = (process.env.API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const deviceId =
  process.argv[2] || process.env.SIM_DEVICE_ID || process.env.DEVICE_ID;

async function main() {
  if (!deviceId) {
    console.error(
      "Falta device_id. Ejemplo: SIM_DEVICE_ID=1 npm run simulate:sensor\n" +
        "  o: node scripts/simulate-sensor-data.js 1"
    );
    process.exit(1);
  }

  const url = `${base}/sensor-data/simulate`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId }),
    });
  } catch (err) {
    const code = err?.cause?.code || err?.code;
    if (code === "ECONNREFUSED") {
      console.error(
        `No hay servidor en ${base} (conexión rechazada).\n` +
          "  Arranca el API en otra terminal: npm run dev\n" +
          "  y revisa que API_BASE_URL coincida con el puerto (por defecto 3000)."
      );
      process.exit(1);
    }
    throw err;
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  console.log(res.status, json);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
