const express = require("express");
const cors = require("cors");
const serverless = require("serverless-http");

const app = express();
app.use(cors());
app.use(express.json());

const plants = [
  {
    name: "jacaranda",
    scientific_name: "Jacaranda mimosifolia",
    category: "arbol",
    water_demand: "media",
    min_soil_moisture: 30,
    max_soil_moisture: 50,
    notes: "Tolera calor urbano con riego moderado.",
  },
  {
    name: "ficus",
    scientific_name: "Ficus benjamina",
    category: "arbol",
    water_demand: "media-alta",
    min_soil_moisture: 40,
    max_soil_moisture: 60,
    notes: "Prefiere humedad estable.",
  },
  {
    name: "encino",
    scientific_name: "Quercus spp.",
    category: "arbol",
    water_demand: "media",
    min_soil_moisture: 35,
    max_soil_moisture: 55,
    notes: "Resistente en climas secos cuando madura.",
  },
];

const devices = new Map();
const readings = [];

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function parseDateInput(value) {
  if (!value) return null;
  const normalized = value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function wateringDecision(soilMoisture, plantType) {
  const plant = plants.find(
    (p) => p.name.toLowerCase() === String(plantType || "").toLowerCase()
  );
  const min = plant?.min_soil_moisture ?? 35;
  const max = plant?.max_soil_moisture ?? 55;

  if (soilMoisture < min) {
    return { action: "water", reason: "soil moisture below plant threshold" };
  }
  if (soilMoisture > max) {
    return { action: "do_not_water", reason: "soil moisture above plant threshold" };
  }
  return { action: "optimal", reason: "soil moisture in optimal range" };
}

app.get("/health", (_req, res) => {
  res.json({ status: "running" });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.0.0",
    info: { title: "Urban Green Backend API", version: "1.0.0" },
    paths: {
      "/health": { get: { summary: "Health check" } },
      "/devices/register": { post: { summary: "Register device" } },
      "/devices": { get: { summary: "List devices" } },
      "/devices/{device_id}": {
        get: { summary: "Get device" },
        patch: { summary: "Update device" },
        delete: { summary: "Delete device" },
      },
      "/plants": { get: { summary: "List plants catalog" } },
      "/plants/{name}": { get: { summary: "Get plant by name" } },
      "/sensor-data": { post: { summary: "Ingest sensor reading" } },
      "/sensor-history/{device_id}": { get: { summary: "Get sensor history" } },
      "/simulate-reading": { post: { summary: "Generate and store simulated reading" } },
    },
  });
});

app.post("/devices/register", (req, res) => {
  const { device_id, plant_type, latitude, longitude } = req.body || {};
  if (!device_id || !plant_type) {
    return res.status(400).json({
      error: "device_id y plant_type son obligatorios",
    });
  }
  const device = {
    device_id: String(device_id),
    plant_type: String(plant_type),
    latitude: Number(latitude ?? 0),
    longitude: Number(longitude ?? 0),
    updated_at: nowSql(),
  };
  devices.set(device.device_id, device);
  return res.status(201).json(device);
});

app.get("/devices", (_req, res) => {
  res.json(Array.from(devices.values()));
});

app.get("/devices/:device_id", (req, res) => {
  const device = devices.get(req.params.device_id);
  if (!device) {
    return res.status(404).json({ error: "Dispositivo no encontrado" });
  }
  return res.json(device);
});

app.patch("/devices/:device_id", (req, res) => {
  const current = devices.get(req.params.device_id);
  if (!current) {
    return res.status(404).json({ error: "Dispositivo no encontrado" });
  }
  const next = {
    ...current,
    ...req.body,
    device_id: current.device_id,
    updated_at: nowSql(),
  };
  devices.set(current.device_id, next);
  return res.json(next);
});

app.delete("/devices/:device_id", (req, res) => {
  if (!devices.has(req.params.device_id)) {
    return res.status(404).json({ error: "Dispositivo no encontrado" });
  }
  devices.delete(req.params.device_id);
  return res.json({ deleted: true });
});

app.get("/plants", (_req, res) => {
  res.json(plants);
});

app.get("/plants/:name", (req, res) => {
  const name = decodeURIComponent(req.params.name).toLowerCase();
  const plant = plants.find((p) => p.name.toLowerCase() === name);
  if (!plant) {
    return res.status(404).json({ error: "Planta no encontrada" });
  }
  return res.json(plant);
});

app.post("/sensor-data", (req, res) => {
  const {
    device_id,
    temperature,
    soil_moisture,
    plant_type,
    latitude,
    longitude,
  } = req.body || {};

  if (!device_id || soil_moisture === undefined || soil_moisture === null) {
    return res.status(400).json({
      error: "device_id y soil_moisture son obligatorios",
    });
  }
  if (!devices.has(device_id)) {
    return res.status(404).json({
      error: "El dispositivo no existe, regístralo primero en /devices/register",
    });
  }

  const reading = {
    device_id: String(device_id),
    temperature: Number(temperature ?? 0),
    soil_moisture: Number(soil_moisture),
    plant_type: String(plant_type || devices.get(device_id).plant_type || ""),
    latitude: Number(latitude ?? devices.get(device_id).latitude ?? 0),
    longitude: Number(longitude ?? devices.get(device_id).longitude ?? 0),
    created_at: nowSql(),
  };
  readings.push(reading);

  const decision = wateringDecision(reading.soil_moisture, reading.plant_type);
  return res.status(201).json({
    ...decision,
    device_id: reading.device_id,
    plant_type: reading.plant_type,
  });
});

app.get("/sensor-history/:device_id", (req, res) => {
  const { device_id } = req.params;
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 100)));
  const from = parseDateInput(String(req.query.from || ""));
  const to = parseDateInput(String(req.query.to || ""));

  let deviceReadings = readings.filter((r) => r.device_id === device_id);
  if (from) {
    deviceReadings = deviceReadings.filter(
      (r) => new Date(r.created_at.replace(" ", "T")) >= from
    );
  }
  if (to) {
    deviceReadings = deviceReadings.filter(
      (r) => new Date(r.created_at.replace(" ", "T")) <= to
    );
  }

  const sorted = deviceReadings
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit)
    .map((r) => ({
      temperature: r.temperature,
      soil_moisture: r.soil_moisture,
      created_at: r.created_at,
    }));

  return res.json({
    device_id,
    readings: sorted,
  });
});

app.post("/simulate-reading", (req, res) => {
  const { device_id } = req.body || {};
  if (!device_id) {
    return res.status(400).json({ error: "device_id es obligatorio" });
  }
  const device = devices.get(device_id);
  if (!device) {
    return res.status(404).json({
      error: "El dispositivo no existe, regístralo primero en /devices/register",
    });
  }

  const temperature = Math.floor(26 + Math.random() * 14);
  const soil_moisture = Math.floor(15 + Math.random() * 60);
  const decision = wateringDecision(soil_moisture, device.plant_type);

  readings.push({
    device_id: device.device_id,
    temperature,
    soil_moisture,
    plant_type: device.plant_type,
    latitude: device.latitude,
    longitude: device.longitude,
    created_at: nowSql(),
  });

  return res.json({
    device_id: device.device_id,
    temperature,
    soil_moisture,
    action: decision.action,
    reason: decision.reason,
  });
});

module.exports.handler = serverless(app);
