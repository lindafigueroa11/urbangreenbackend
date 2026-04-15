const express = require("express");
const pool = require("../db");
const { toInternalDeviceId } = require("../utils/devicePublicId");

const router = express.Router();

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Prioriza humedad de suelo; si no hay, usa humedad ambiente (columnas del API). */
function moistureForIrrigation(row) {
  const soil = toFiniteNumber(row.soil_moisture);
  if (soil !== null) return soil;
  return toFiniteNumber(row.humidity);
}

router.get("/:idsensor", async (req, res) => {
  const { idsensor } = req.params;
  const deviceId = toInternalDeviceId(idsensor);
  if (!deviceId) {
    return res.status(400).json({ error: "idsensor inválido" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, device_id, temperature, humidity, soil_moisture, created_at
      FROM sensor_data
      WHERE device_id = $1
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [deviceId]
    );

    const data = result.rows;
    if (!data.length) {
      return res.status(404).json({ error: "No hay datos del sensor" });
    }

    const values = data.map((row) => moistureForIrrigation(row)).filter((v) => v !== null);
    if (!values.length) {
      return res.status(404).json({ error: "No hay lecturas de humedad válidas" });
    }

    const suma = values.reduce((acc, v) => acc + v, 0);
    const promedio = suma / values.length;

    let accion = "mantener";
    if (promedio < 40) {
      accion = "encender riego";
    } else if (promedio > 60) {
      accion = "apagar riego";
    }

    return res.json({
      sensor: String(idsensor),
      promedio_humedad: promedio.toFixed(2),
      accion,
      lecturas_usadas: data,
    });
  } catch (error) {
    console.error("GET /control-riego/:idsensor error:", error);
    return res.status(500).json({ error: "Error al obtener datos" });
  }
});

module.exports = router;
