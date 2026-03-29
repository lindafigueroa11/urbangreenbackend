const rateLimit = require("express-rate-limit");

const windowMs =
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const maxGlobal =
  Number(process.env.RATE_LIMIT_MAX) || 500;
const maxClassify =
  Number(process.env.RATE_LIMIT_CLASSIFY_MAX) || 30;
const maxInsights =
  Number(process.env.RATE_LIMIT_INSIGHTS_MAX) || 25;
const maxGeminiTest =
  Number(process.env.RATE_LIMIT_GEMINI_TEST_MAX) || 15;

/**
 * Limite general por IP (todas las rutas salvo las que se salten abajo).
 */
const apiLimiter = rateLimit({
  windowMs,
  max: maxGlobal,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
  message: {
    error: "Too many requests",
    details:
      "Has superado el límite de peticiones por IP. Espera unos minutos e intenta de nuevo.",
  },
});

/**
 * Limite mas estricto para clasificacion de plantas (coste de API externa).
 */
const classifyLimiter = rateLimit({
  windowMs,
  max: maxClassify,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many classification requests",
    details:
      "Demasiados intentos de identificación desde esta IP. Prueba más tarde.",
  },
});

/**
 * Límite para notas IA por planta (coste OpenAI).
 */
const insightsLimiter = rateLimit({
  windowMs,
  max: maxInsights,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many insight requests",
    details:
      "Demasiadas solicitudes de información IA desde esta IP. Prueba más tarde.",
  },
});

/** POST /plants/gemini-test (pruebas Postman; coste API). */
const geminiTestLimiter = rateLimit({
  windowMs,
  max: maxGeminiTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many Gemini test requests",
    details:
      "Demasiadas pruebas de Gemini desde esta IP. Prueba más tarde.",
  },
});

module.exports = {
  apiLimiter,
  classifyLimiter,
  insightsLimiter,
  geminiTestLimiter,
};
