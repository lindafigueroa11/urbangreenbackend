const deviceModel = require("../models/deviceModel");
const plantModel = require("../models/plantModel");

function hasMissingRegisterFields(body) {
  return (
    !body.device_id ||
    !body.plant_type ||
    body.latitude === undefined ||
    body.longitude === undefined
  );
}

async function registerDevice(req, res) {
  try {
    const payload = req.body;

    if (hasMissingRegisterFields(payload)) {
      return res.status(400).json({
        error: "Missing required fields: device_id, plant_type, latitude, longitude"
      });
    }

    const plant = await plantModel.findByName(payload.plant_type);
    if (!plant) {
      return res.status(400).json({
        error: `Plant type '${payload.plant_type}' is not supported`
      });
    }

    const existing = await deviceModel.findByDeviceId(payload.device_id);
    const device = existing
      ? await deviceModel.updateByDeviceId(payload.device_id, payload)
      : await deviceModel.create(payload);

    return res.status(existing ? 200 : 201).json({
      message: existing ? "Device updated" : "Device registered",
      device
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to register device",
      details: error.message
    });
  }
}

async function listDevices(_req, res) {
  try {
    const devices = await deviceModel.listAll();
    return res.json(devices);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to list devices",
      details: error.message
    });
  }
}

async function getDeviceById(req, res) {
  try {
    const { device_id: deviceId } = req.params;
    const device = await deviceModel.findByDeviceId(deviceId);

    if (!device) {
      return res.status(404).json({ error: `Device '${deviceId}' not found` });
    }

    return res.json(device);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch device",
      details: error.message
    });
  }
}

async function patchDevice(req, res) {
  try {
    const { device_id: deviceId } = req.params;
    const payload = req.body || {};

    const current = await deviceModel.findByDeviceId(deviceId);
    if (!current) {
      return res.status(404).json({ error: `Device '${deviceId}' not found` });
    }

    const hasSupportedField =
      payload.plant_type !== undefined ||
      payload.latitude !== undefined ||
      payload.longitude !== undefined;

    if (!hasSupportedField) {
      return res.status(400).json({
        error: "Provide at least one field: plant_type, latitude, longitude"
      });
    }

    if (payload.plant_type !== undefined) {
      const plant = await plantModel.findByName(payload.plant_type);
      if (!plant) {
        return res.status(400).json({
          error: `Plant type '${payload.plant_type}' is not supported`
        });
      }
    }

    const updated = await deviceModel.patchByDeviceId(deviceId, payload);
    return res.json({
      message: "Device updated",
      device: updated
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to patch device",
      details: error.message
    });
  }
}

async function deleteDevice(req, res) {
  try {
    const { device_id: deviceId } = req.params;
    const current = await deviceModel.findByDeviceId(deviceId);

    if (!current) {
      return res.status(404).json({ error: `Device '${deviceId}' not found` });
    }

    await deviceModel.deleteByDeviceId(deviceId);

    return res.json({
      message: "Device deleted",
      device_id: deviceId
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to delete device",
      details: error.message
    });
  }
}

module.exports = {
  registerDevice,
  listDevices,
  getDeviceById,
  patchDevice,
  deleteDevice
};
