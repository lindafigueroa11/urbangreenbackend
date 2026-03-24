const express = require("express");
const pool = require("../db");

const router = express.Router();     

router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, location, latitude, longitude, created_at FROM devices ORDER BY created_at DESC"
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("GET /devices error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, location, latitude, longitude } = req.body;

    if (
      !name ||
      !location ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return res.status(400).json({
        error: "name, location, latitude and longitude are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO devices (name, location, latitude, longitude)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, location, latitude, longitude, created_at
      `,
      [name, location, latitude, longitude]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("POST /devices error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
