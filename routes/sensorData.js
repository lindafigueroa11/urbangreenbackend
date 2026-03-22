const express = require("express");
const pool = require("../db");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { device_id, temperature, humidity, soil_moisture } = req.body;

    if (
      !device_id ||
      temperature === undefined ||
      humidity === undefined ||
      soil_moisture === undefined
    ) {
      return res.status(400).json({
        error: "device_id, temperature, humidity and soil_moisture are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO sensor_data (device_id, temperature, humidity, soil_moisture)
      VALUES ($1, $2, $3, $4)
      RETURNING id, device_id, temperature, humidity, soil_moisture, created_at
      `,
      [device_id, temperature, humidity, soil_moisture]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("POST /sensor-data error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 100;

    const result = await pool.query(
      `
      SELECT id, device_id, temperature, humidity, soil_moisture, created_at
      FROM sensor_data
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("GET /sensor-data error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:device_id", async (req, res) => {
  try {
    const { device_id } = req.params;

    const result = await pool.query(
      `
      SELECT id, device_id, temperature, humidity, soil_moisture, created_at
      FROM sensor_data
      WHERE device_id = $1
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [device_id]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("GET /sensor-data/:device_id error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
