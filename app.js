const express = require("express");
const cors = require("cors");
const devicesRoutes = require("./routes/devices");
const sensorDataRoutes = require("./routes/sensorData");
const greenZonesRoutes = require("./routes/greenZones");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/devices", devicesRoutes);
app.use("/sensor-data", sensorDataRoutes);
app.use("/green-zones", greenZonesRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

module.exports = app;
