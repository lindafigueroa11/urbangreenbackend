const express = require("express");
const { classifyPlantImage } = require("../services/plantClassifier");

const router = express.Router();

router.post("/classify", async (req, res) => {
  try {
    const imageBase64 =
      req.body?.image_base64 || req.body?.imageBase64 || req.body?.image;
    const mimeType = req.body?.mimeType || req.body?.mime_type || "image/jpeg";
    const language = req.body?.language || "es";

    if (!imageBase64) {
      return res.status(400).json({
        error: "image_base64 is required"
      });
    }

    const result = await classifyPlantImage({
      imageBase64,
      mimeType,
      language
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
