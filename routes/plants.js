const express = require("express");
const { classifyPlantImage } = require("../services/plantClassifier");
const { generatePlantInsights } = require("../services/plantInsights");
const {
  classifyLimiter,
  insightsLimiter,
  geminiTestLimiter,
  chatLimiter,
} = require("../middleware/rateLimit");
const { geminiTestEcho } = require("../services/geminiTestEcho");
const { validateClassifyPayload } = require("../utils/validateClassifyPayload");
const {
  validatePlantInsightsPayload,
} = require("../utils/validatePlantInsightsPayload");
const { validatePlantChatPayload } = require("../utils/validatePlantChatPayload");
const { generatePlantChatReply } = require("../services/plantChatGemini");

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

router.post("/chat", chatLimiter, async (req, res) => {
  try {
    const checked = validatePlantChatPayload(req.body);
    if (!checked.ok) {
      return res.status(checked.status).json({
        error: checked.error,
        code: checked.code || "INVALID_PAYLOAD",
      });
    }

    const out = await generatePlantChatReply({
      language: checked.language,
      context: checked.context,
      messages: checked.messages,
    });

    return res.status(200).json({
      reply: out.reply,
      ...(out.warning ? { warning: out.warning } : {}),
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 503) {
      return res.status(503).json({
        error: error.message || "Chat IA no disponible.",
        code: error.code || "CHAT_UNAVAILABLE",
      });
    }
    if (statusCode === 429) {
      return res.status(429).json({
        error: "Demasiadas solicitudes al servicio IA.",
        code: "CHAT_RATE_LIMIT",
      });
    }
    if (statusCode === 504) {
      return res.status(504).json({
        error: error.message || "Tiempo de espera agotado.",
        code: error.code || "CHAT_TIMEOUT",
      });
    }
    console.error("POST /plants/chat error:", error);
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: "No se pudo obtener respuesta del chat.",
      code: "CHAT_FAILED",
      details: error.message,
    });
  }
});

/**
 * Prueba de conexión a Gemini (Postman / diagnóstico).
 * POST body JSON: { "message": "tu texto" }
 * Requiere GEMINI_API_KEY en el servidor. Opcional: GEMINI_MODEL o GEMINI_TEST_MODEL.
 */
router.post("/gemini-test", geminiTestLimiter, async (req, res) => {
  try {
    const { reply, model } = await geminiTestEcho({
      message: req.body?.message,
    });
    return res.status(200).json({
      ok: true,
      model,
      reply,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 400) {
      return res.status(400).json({
        ok: false,
        error: error.message,
        code: "INVALID_BODY",
      });
    }
    if (statusCode === 503) {
      return res.status(503).json({
        ok: false,
        error: error.message,
        code: error.code || "GEMINI_KEY_MISSING",
      });
    }
    if (statusCode === 429) {
      return res.status(429).json({
        ok: false,
        error: error.message,
        code: "GEMINI_RATE_LIMIT",
      });
    }
    if (statusCode === 504) {
      return res.status(504).json({
        ok: false,
        error: error.message,
        code: "GEMINI_TIMEOUT",
      });
    }
    console.error("POST /plants/gemini-test error:", error);
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      ok: false,
      error: "Fallo al llamar a Gemini.",
      code: "GEMINI_TEST_FAILED",
      details: error.message,
    });
  }
});

module.exports = router;
