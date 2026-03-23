const express = require("express");
const {
  getTemperature,
  postTemperatureBatch,
} = require("../src/controllers/temperatureController");

const router = express.Router();

router.get("/temperature", getTemperature);
router.post("/temperature/batch", postTemperatureBatch);

module.exports = router;
