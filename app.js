const express = require("express");
const cors = require("cors");
const devicesRoutes = require("./routes/devices");
const sensorDataRoutes = require("./routes/sensorData");
const greenZonesRoutes = require("./routes/greenZones");
const plantsRoutes = require("./routes/plants");
const { apiLimiter } = require("./middleware/rateLimit");

const app = express();

app.set("trust proxy", 1);

app.use(cors());
app.use(apiLimiter);
app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/devices", devicesRoutes);
app.use("/sensor-data", sensorDataRoutes);
app.use("/green-zones", greenZonesRoutes);
app.use("/plants", plantsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: "Payload too large",
      details: "Reduce image size before sending."
    });
  }
  return res.status(500).json({
    error: "Unhandled server error",
    details: error?.message || "Unknown error"
  });
});

module.exports = app;
