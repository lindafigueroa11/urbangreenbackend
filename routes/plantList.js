const express = require("express");
const pool = require("../db");
const { ensurePlantCatalogSchema } = require("../services/plantCatalogSchema");

const router = express.Router();

/** Primera petición crea/semea `plants` (por si el servidor no pasó por server.js). */
let catalogInitPromise = null;
function ensureCatalogReady() {
  if (!catalogInitPromise) {
    catalogInitPromise = ensurePlantCatalogSchema().catch((err) => {
      catalogInitPromise = null;
      throw err;
    });
  }
  return catalogInitPromise;
}

function rowToPlantApi(r) {
  return {
    id: r.id,
    name: r.name,
    min_soil_moisture: Number(r.min_soil_moisture),
    max_soil_moisture: Number(r.max_soil_moisture),
    scientific_name: r.scientific_name ?? "",
    plant_category: r.plant_category ?? "",
    water_need: r.water_need ?? "",
    sun_exposure: r.sun_exposure ?? "",
    soil_preference: r.soil_preference ?? "",
    climate_preference: r.climate_preference ?? "",
    notes: r.notes ?? "",
  };
}

/** GET /plants?q= — lista o búsqueda por nombre/científico (para la app) */
router.get("/", async (req, res) => {
  try {
    await ensureCatalogReady();
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    let result;
    if (q.length > 0) {
      const like = `%${q}%`;
      result = await pool.query(
        `
        SELECT id, name, min_soil_moisture, max_soil_moisture, scientific_name,
               plant_category, water_need, sun_exposure, soil_preference, climate_preference, notes
        FROM plants
        WHERE name ILIKE $1 OR COALESCE(scientific_name, '') ILIKE $1
        ORDER BY name ASC
        LIMIT 50
        `,
        [like]
      );
    } else {
      result = await pool.query(
        `
        SELECT id, name, min_soil_moisture, max_soil_moisture, scientific_name,
               plant_category, water_need, sun_exposure, soil_preference, climate_preference, notes
        FROM plants
        ORDER BY name ASC
        LIMIT 100
        `
      );
    }
    return res.status(200).json(result.rows.map(rowToPlantApi));
  } catch (error) {
    console.error("GET /plants (list) error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /plants/:name — una planta por nombre (clave en catálogo) */
router.get("/:name", async (req, res) => {
  try {
    await ensureCatalogReady();
    const name = decodeURIComponent(req.params.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }
    const result = await pool.query(
      `
      SELECT id, name, min_soil_moisture, max_soil_moisture, scientific_name,
             plant_category, water_need, sun_exposure, soil_preference, climate_preference, notes
      FROM plants
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
      `,
      [name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Plant not found" });
    }
    return res.status(200).json(rowToPlantApi(result.rows[0]));
  } catch (error) {
    console.error("GET /plants/:name error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
