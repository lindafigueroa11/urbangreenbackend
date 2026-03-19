const express = require("express");
const {
  sensorDataIngest,
  getSensorHistory,
  simulateReading,
  getSensorsLatest
} = require("../controllers/sensorDataController");

const router = express.Router();

router.post("/sensor-data", sensorDataIngest);
router.get("/sensors/latest", getSensorsLatest);
router.get("/sensor-history/:device_id", getSensorHistory);
router.post("/simulate-reading", simulateReading);

module.exports = router;
