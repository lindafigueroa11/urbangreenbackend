const express = require("express");
const { classifyPlantImage } = require("../services/plantClassifier");
const { classifyLimiter } = require("../middleware/rateLimit");
const { validateClassifyPayload } = require("../utils/validateClassifyPayload");

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

module.exports = router;
