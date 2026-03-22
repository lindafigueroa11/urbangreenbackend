const express = require("express");
const {
  listHermosilloGreenZones,
  intersectHermosilloGreenZones
} = require("../controllers/greenZoneController");

const router = express.Router();

router.get("/hermosillo", listHermosilloGreenZones);
router.post("/hermosillo/intersections", intersectHermosilloGreenZones);

module.exports = router;
