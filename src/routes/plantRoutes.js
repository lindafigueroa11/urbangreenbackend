const express = require("express");
const { listPlants, getPlantByName } = require("../controllers/plantController");

const router = express.Router();

router.get("/", listPlants);
router.get("/:name", getPlantByName);

module.exports = router;
