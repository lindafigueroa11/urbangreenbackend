const rateLimit = require("express-rate-limit");

const windowMs =
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const maxGlobal =
  Number(process.env.RATE_LIMIT_MAX) || 500;
const maxClassify =
  Number(process.env.RATE_LIMIT_CLASSIFY_MAX) || 30;

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

module.exports = { apiLimiter, classifyLimiter };
