const plantModel = require("../models/plantModel");

async function listPlants(_req, res) {
  try {
    const plants = await plantModel.listAll();
    return res.json(plants);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch plants",
      details: error.message
    });
  }
}

async function getPlantByName(req, res) {
  try {
    const plantName = String(req.params.name || "").trim();
    if (!plantName) {
      return res.status(400).json({ error: "Plant name is required" });
    }

    const plant = await plantModel.findByName(plantName);
    if (!plant) {
      return res.status(404).json({
        error: `Plant '${plantName}' not found`
      });
    }

    return res.json(plant);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch plant",
      details: error.message
    });
  }
}

module.exports = {
  listPlants,
  getPlantByName
};
