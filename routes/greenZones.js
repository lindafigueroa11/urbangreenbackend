const express = require("express");
const {
  listHermosilloGreenZones,
  intersectHermosilloGreenZones,
  proxyGooglePlacePhoto
} = require("../src/controllers/greenZoneController");

const router = express.Router();

router.get("/hermosillo", listHermosilloGreenZones);
router.post("/hermosillo/intersections", intersectHermosilloGreenZones);
router.get("/hermosillo/place-photo", proxyGooglePlacePhoto);

module.exports = router;
