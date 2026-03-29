const express = require("express");
const { classifyPlantImage } = require("../services/plantClassifier");
const { generatePlantInsights } = require("../services/plantInsightsAi");
const { classifyLimiter, insightsLimiter } = require("../middleware/rateLimit");
const { validateClassifyPayload } = require("../utils/validateClassifyPayload");
const {
  validatePlantInsightsPayload,
} = require("../utils/validatePlantInsightsPayload");

const router = express.Router();

router.post("/classify", classifyLimiter, async (req, res) => {
  try {
    const checked = validateClassifyPayload(req.body);
    if (!checked.ok) {
      return res.status(checked.status).json({
        error: checked.error,
        ...(checked.details ? { details: checked.details } : {}),
      });
    }

    const { imageBase64, mimeType, language } = checked;

    const result = await classifyPlantImage({
      imageBase64,
      mimeType,
      language,
    });

    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      error: "Failed to classify plant image",
      details: error.message
    });
  }
});

router.post("/insights", insightsLimiter, async (req, res) => {
  try {
    const checked = validatePlantInsightsPayload(req.body);
    if (!checked.ok) {
      return res.status(checked.status).json({
        error: checked.error,
        code: "INVALID_PAYLOAD",
      });
    }

    const insights = await generatePlantInsights({
      label: checked.label,
      scientific_name: checked.scientific_name,
      language: checked.language,
    });

    return res.status(200).json({ insights });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 503 || statusCode === 501) {
      return res.status(statusCode).json({
        error: error.message || "Información IA no disponible.",
        code: error.code || "INSIGHTS_UNAVAILABLE",
      });
    }
    if (statusCode === 429) {
      return res.status(429).json({
        error: "Demasiadas solicitudes al servicio IA.",
        code: "INSIGHTS_RATE_LIMIT",
      });
    }
    if (statusCode === 504) {
      return res.status(504).json({
        error: error.message || "Tiempo de espera agotado.",
        code: "INSIGHTS_TIMEOUT",
      });
    }
    console.error("POST /plants/insights error:", error);
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: "No se pudo generar la información de la planta.",
      code: "INSIGHTS_FAILED",
      details: error.message,
    });
  }
});

module.exports = router;
