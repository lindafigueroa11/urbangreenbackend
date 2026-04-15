const express = require("express");
const pool = require("../db");
const {
  toPublicDeviceId,
  toInternalDeviceId,
} = require("../utils/devicePublicId");

const router = express.Router();     
let linkColumnsReady = false;

async function ensureLinkColumns() {
  if (linkColumnsReady) return;
  await pool.query(
    "ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_linked BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await pool.query(
    "ALTER TABLE devices ADD COLUMN IF NOT EXISTS linked_zone TEXT"
  );
  linkColumnsReady = true;
}

function serializeDevice(row) {
  const publicId = toPublicDeviceId(row.id);
  return {
    ...row,
    internal_id: row.id,
    id: publicId ?? row.id,
  };
}

router.get("/", async (_req, res) => {
  try {
    await ensureLinkColumns();
    const result = await pool.query(
      `SELECT id, name, location, latitude, longitude,
              plant_type, is_linked, linked_zone, created_at
       FROM devices ORDER BY created_at DESC`
    );
    return res.status(200).json(result.rows.map(serializeDevice));
  } catch (error) {
    console.error("GET /devices error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    await ensureLinkColumns();
    const id = toInternalDeviceId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid device id" });
    }
    const result = await pool.query(
      `SELECT id, name, location, latitude, longitude, plant_type, is_linked, linked_zone, created_at
       FROM devices WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }
    return res.status(200).json(serializeDevice(result.rows[0]));
  } catch (error) {
    console.error("GET /devices/:id error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    await ensureLinkColumns();
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
      RETURNING id, name, location, latitude, longitude, plant_type, is_linked, linked_zone, created_at
      `,
      [name, location, latitude, longitude]
    );

    return res.status(201).json(serializeDevice(result.rows[0]));
  } catch (error) {
    console.error("POST /devices error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    await ensureLinkColumns();
    const id = toInternalDeviceId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid device id" });
    }
    const { plant_type: plantTypeRaw } = req.body ?? {};
    if (plantTypeRaw === undefined || plantTypeRaw === null) {
      return res.status(400).json({ error: "plant_type is required" });
    }
    const plantType = String(plantTypeRaw).trim();
    if (!plantType) {
      return res.status(400).json({ error: "plant_type must be non-empty" });
    }

    const plantCheck = await pool.query(
      "SELECT name FROM plants WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [plantType]
    );
    if (plantCheck.rows.length === 0) {
      return res.status(400).json({ error: "Planta no encontrada en el catálogo" });
    }
    const canonicalName = plantCheck.rows[0].name;

    const result = await pool.query(
      `UPDATE devices
       SET plant_type = $1
       WHERE id = $2
       RETURNING id, name, location, latitude, longitude, plant_type, is_linked, linked_zone, created_at`,
      [canonicalName, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }
    return res.status(200).json(serializeDevice(result.rows[0]));
  } catch (error) {
    console.error("PATCH /devices/:id error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/link-status", async (req, res) => {
  try {
    await ensureLinkColumns();
    const id = toInternalDeviceId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid device id" });
    }

    const result = await pool.query(
      `SELECT id, is_linked, linked_zone, location
       FROM devices
       WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    const row = result.rows[0];
    return res.status(200).json({
      id: toPublicDeviceId(row.id) ?? row.id,
      internal_id: row.id,
      is_linked: Boolean(row.is_linked),
      linked_zone: row.linked_zone ?? null,
      location: row.location ?? null,
    });
  } catch (error) {
    console.error("GET /devices/:id/link-status error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/link", async (req, res) => {
  try {
    await ensureLinkColumns();
    const id = toInternalDeviceId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid device id" });
    }

    const requestedZoneRaw = req.body?.zone;
    const requestedZone =
      typeof requestedZoneRaw === "string" && requestedZoneRaw.trim()
        ? requestedZoneRaw.trim()
        : null;

    const current = await pool.query(
      `SELECT id, is_linked, linked_zone, location
       FROM devices
       WHERE id = $1`,
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    const row = current.rows[0];
    const effectiveZone = requestedZone ?? row.location ?? "Zona principal";

    if (row.is_linked && row.linked_zone && row.linked_zone !== effectiveZone) {
      return res.status(409).json({
        error: "El dispositivo ya está vinculado a otra zona",
        linked_zone: row.linked_zone,
      });
    }

    const updated = await pool.query(
      `UPDATE devices
       SET is_linked = TRUE,
           linked_zone = COALESCE($1, linked_zone, location, 'Zona principal')
       WHERE id = $2
       RETURNING id, name, location, latitude, longitude, plant_type, is_linked, linked_zone, created_at`,
      [requestedZone, id]
    );

    return res.status(200).json(serializeDevice(updated.rows[0]));
  } catch (error) {
    console.error("POST /devices/:id/link error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/unlink", async (req, res) => {
  try {
    await ensureLinkColumns();
    const id = toInternalDeviceId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid device id" });
    }

    const current = await pool.query(
      `SELECT id, is_linked, linked_zone
       FROM devices
       WHERE id = $1`,
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    const updated = await pool.query(
      `UPDATE devices
       SET is_linked = FALSE,
           linked_zone = NULL
       WHERE id = $1
       RETURNING id, name, location, latitude, longitude, plant_type, is_linked, linked_zone, created_at`,
      [id]
    );

    return res.status(200).json(serializeDevice(updated.rows[0]));
  } catch (error) {
    console.error("POST /devices/:id/unlink error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
