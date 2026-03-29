const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

function rowToApi(row) {
  return {
    id: row.id,
    label: row.label,
    scientific_name: row.scientific_name,
    plant_type: row.plant_type,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    water_need: row.water_need,
    watering_times: row.watering_times,
    watering_note: row.watering_note,
    classification_json:
      typeof row.classification_json === "string"
        ? row.classification_json
        : JSON.stringify(row.classification_json),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

router.get("/plants", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, label, scientific_name, plant_type, confidence, water_need,
              watering_times, watering_note, classification_json, created_at
       FROM user_plants
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );
    const plants = result.rows.map(rowToApi);
    return res.status(200).json({ plants });
  } catch (error) {
    console.error("GET /user/plants error:", error);
    return res.status(500).json({ message: "No se pudieron cargar las plantas guardadas." });
  }
});

router.post("/plants", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const watering_times =
      typeof body.watering_times === "string" ? body.watering_times.trim() : "";

    let classification_json = body.classification_json;
    if (classification_json == null) {
      return res.status(400).json({ message: "Falta classification_json." });
    }
    if (typeof classification_json === "object") {
      classification_json = JSON.stringify(classification_json);
    } else if (typeof classification_json !== "string") {
      return res.status(400).json({ message: "classification_json inválido." });
    }
    if (!label) {
      return res.status(400).json({ message: "Falta label." });
    }
    if (!watering_times) {
      return res.status(400).json({ message: "Falta watering_times." });
    }

    const scientific_name =
      body.scientific_name == null || body.scientific_name === ""
        ? null
        : String(body.scientific_name);
    const plant_type =
      body.plant_type == null || body.plant_type === ""
        ? null
        : String(body.plant_type);
    const water_need =
      body.water_need == null || body.water_need === ""
        ? null
        : String(body.water_need);
    const watering_note =
      body.watering_note == null || body.watering_note === ""
        ? null
        : String(body.watering_note);

    let confidence = null;
    if (body.confidence != null && body.confidence !== "") {
      const n = Number(body.confidence);
      if (Number.isFinite(n)) {
        confidence = n;
      }
    }

    const inserted = await pool.query(
      `INSERT INTO user_plants (
        user_id, label, scientific_name, plant_type, confidence, water_need,
        watering_times, watering_note, classification_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, user_id, label, scientific_name, plant_type, confidence, water_need,
                watering_times, watering_note, classification_json, created_at`,
      [
        req.userId,
        label,
        scientific_name,
        plant_type,
        confidence,
        water_need,
        watering_times,
        watering_note,
        classification_json,
      ]
    );

    const plant = rowToApi(inserted.rows[0]);
    return res.status(201).json({ plant });
  } catch (error) {
    console.error("POST /user/plants error:", error);
    return res.status(500).json({ message: "No se pudo guardar la planta." });
  }
});

router.delete("/plants/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Id inválido." });
    }

    const result = await pool.query(
      `DELETE FROM user_plants WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Planta no encontrada." });
    }
    return res.status(204).send();
  } catch (error) {
    console.error("DELETE /user/plants/:id error:", error);
    return res.status(500).json({ message: "No se pudo eliminar la planta." });
  }
});

module.exports = router;
