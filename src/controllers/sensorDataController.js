const deviceModel = require("../models/deviceModel");
const sensorDataModel = require("../models/sensorDataModel");
const { decideWatering } = require("../services/wateringService");
const { generateReading } = require("../services/simulationService");

function hasMissingSensorFields(body) {
  return (
    !body.device_id ||
    body.temperature === undefined ||
    body.soil_moisture === undefined
  );
}

async function resolvePlantType(payload) {
  const device = await deviceModel.findByDeviceId(payload.device_id);

  if (!device) {
    return {
      error: `Device '${payload.device_id}' is not registered. Register it first using /devices/register.`
    };
  }

  if (!device.plant_type) {
    return {
      error: `Device '${payload.device_id}' does not have a plant_type assigned`
    };
  }

  return { plantTypeToUse: device.plant_type };
}

async function saveAndDecide(payload) {
  const resolveResult = await resolvePlantType(payload);
  if (resolveResult.error) {
    return { status: 400, error: resolveResult.error };
  }

  const decision = await decideWatering(resolveResult.plantTypeToUse, payload.soil_moisture);
  if (decision.action === "unknown") {
    return { status: 400, error: decision.reason };
  }

  await sensorDataModel.create({
    device_id: payload.device_id,
    temperature: payload.temperature,
    soil_moisture: payload.soil_moisture
  });

  await sensorDataModel.upsertLatest({
    device_id: payload.device_id,
    temperature: payload.temperature,
    soil_moisture: payload.soil_moisture
  });

  return {
    status: 201,
    data: {
      action: decision.action,
      reason: decision.reason,
      device_id: payload.device_id,
      plant_type: resolveResult.plantTypeToUse
    }
  };
}

async function sensorDataIngest(req, res) {
  try {
    const payload = req.body;

    if (hasMissingSensorFields(payload)) {
      return res.status(400).json({
        error: "Missing required fields: device_id, temperature, soil_moisture"
      });
    }

    const result = await saveAndDecide(payload);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(result.status).json(result.data);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to process sensor data",
      details: error.message
    });
  }
}

async function getSensorHistory(req, res) {
  try {
    const { device_id: deviceId } = req.params;
    const { limit, from, to } = req.query;

    if (!deviceId) {
      return res.status(400).json({ error: "device_id is required" });
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit =
      Number.isNaN(parsedLimit) || parsedLimit <= 0 ? 50 : Math.min(parsedLimit, 500);

    const readings = await sensorDataModel.getLatestByDeviceId(deviceId, {
      limit: safeLimit,
      from,
      to
    });

    return res.json({
      device_id: deviceId,
      filters: {
        limit: safeLimit,
        from: from || null,
        to: to || null
      },
      readings
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch sensor history",
      details: error.message
    });
  }
}

async function getSensorsLatest(_req, res) {
  try {
    const sensors = await sensorDataModel.getAllLatestWithLocation();
    return res.json(sensors);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch latest sensor readings",
      details: error.message
    });
  }
}

async function simulateReading(req, res) {
  try {
    const fakeReading = generateReading();
    const payload = {
      ...req.body,
      temperature: fakeReading.temperature,
      soil_moisture: fakeReading.soil_moisture
    };

    if (!payload.device_id) {
      return res.status(400).json({ error: "device_id is required" });
    }

    const result = await saveAndDecide(payload);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(201).json({
      device_id: payload.device_id,
      temperature: payload.temperature,
      soil_moisture: payload.soil_moisture,
      action: result.data.action,
      reason: result.data.reason
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to simulate sensor reading",
      details: error.message
    });
  }
}

module.exports = {
  sensorDataIngest,
  getSensorHistory,
  simulateReading,
  getSensorsLatest
};
