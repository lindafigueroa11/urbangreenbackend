const express = require("express");
const {
  registerDevice,
  listDevices,
  getDeviceById,
  patchDevice,
  deleteDevice
} = require("../controllers/deviceController");

const router = express.Router();

router.get("/", listDevices);
router.post("/register", registerDevice);
router.get("/:device_id", getDeviceById);
router.patch("/:device_id", patchDevice);
router.delete("/:device_id", deleteDevice);

module.exports = router;
