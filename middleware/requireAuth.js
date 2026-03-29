const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../utils/jwtSecret");

/**
 * Exige Authorization: Bearer <JWT> (mismo secreto que /auth/login).
 * Asigna req.userId (number) y req.userEmail (string) si el payload los incluye.
 */
function requireAuth(req, res, next) {
  try {
    const raw = req.headers.authorization;
    if (!raw || typeof raw !== "string") {
      return res.status(401).json({ message: "No autorizado." });
    }
    const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
    if (!match) {
      return res.status(401).json({ message: "No autorizado." });
    }
    const token = match[1];
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
    const sub = decoded.sub;
    if (sub === undefined || sub === null) {
      return res.status(401).json({ message: "Token inválido." });
    }
    const userId = Number(sub);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ message: "Token inválido." });
    }
    req.userId = userId;
    if (decoded.email != null) {
      req.userEmail = String(decoded.email);
    }
    return next();
  } catch (err) {
    if (err?.name === "TokenExpiredError" || err?.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Sesión inválida o caducada." });
    }
    console.error("requireAuth error:", err);
    return res.status(500).json({ message: "Error de autenticación." });
  }
}

module.exports = { requireAuth };
