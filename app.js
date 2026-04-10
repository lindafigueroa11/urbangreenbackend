const express = require("express");
const cors = require("cors");
const path = require("path");
const devicesRoutes = require("./routes/devices");
const sensorDataRoutes = require("./routes/sensorData");
const authRoutes = require("./routes/auth");
const greenZonesRoutes = require("./routes/greenZones");
const plantsRoutes = require("./routes/plants");
const userPlantsRoutes = require("./routes/userPlants");
const weatherRoutes = require("./routes/weather");
const controlRiegoRoutes = require("./routes/controlRiego");
const { apiLimiter } = require("./middleware/rateLimit");

const app = express();

app.set("trust proxy", 1);

app.use(cors());
app.use(apiLimiter);
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/privacy", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacy.html"));
});

app.get("/terms", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "terms.html"));
});

app.use("/auth", authRoutes);
app.use("/devices", devicesRoutes);
app.use("/sensor-data", sensorDataRoutes);
app.use("/control-riego", controlRiegoRoutes);
app.use("/green-zones", greenZonesRoutes);
app.use("/plants", plantsRoutes);
app.use("/user", userPlantsRoutes);
app.use("/weather", weatherRoutes);

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
