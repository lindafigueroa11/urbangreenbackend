const express = require("express");
const cors = require("cors");
const openApiSpec = require("../openapi.json");

const deviceRoutes = require("./routes/deviceRoutes");
const sensorRoutes = require("./routes/sensorRoutes");
const healthRoutes = require("./routes/healthRoutes");
const plantRoutes = require("./routes/plantRoutes");
const { initDatabase } = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3000;
const baseUrl = process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

app.get("/openapi.json", (_req, res) => {
  res.json({
    ...openApiSpec,
    servers: [{ url: baseUrl }]
  });
});

app.use("/devices", deviceRoutes);
app.use("/plants", plantRoutes);
app.use("/", sensorRoutes);
app.use("/health", healthRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`Urban Green API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize application:", error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
