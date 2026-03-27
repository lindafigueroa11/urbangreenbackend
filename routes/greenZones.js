const express = require("express");
const {
  listHermosilloGreenZones,
  intersectHermosilloGreenZones, 
  proxyGooglePlacePhoto,
  proxyGooglePlacePhotoCount
} = require("../src/controllers/greenZoneController");

const router = express.Router();

router.get("/hermosillo", listHermosilloGreenZones);
router.post("/hermosillo/intersections", intersectHermosilloGreenZones);
router.get("/hermosillo/place-photo", proxyGooglePlacePhoto);
router.get(
  "/hermosillo/place-photo-count",
  proxyGooglePlacePhotoCount
);

module.exports = router;
