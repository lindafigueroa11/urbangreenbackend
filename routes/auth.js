const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const {
  generateVerificationToken,
  sendVerificationEmail,
} = require("../services/emailVerification");

const router = express.Router();
let warnedMissingJwtSecret = false;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }

  if (!warnedMissingJwtSecret) {
    console.warn(
      "JWT_SECRET is not set. Using insecure fallback secret for development. Configure JWT_SECRET in production."
    );
    warnedMissingJwtSecret = true;
  }
  return "dev-insecure-fallback-secret-change-me";
}

function toPublicUser(row) {
  return {
    id: String(row.id),
    username: row.username,
    email: row.email,
  };
}

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email y password son requeridos" });
    }
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedUsername = String(username).trim();

    const existing = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [
      normalizedEmail,
    ]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: "Este email ya está registrado." });
    }

    const verifyToken = generateVerificationToken();
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await pool.query(
      `
      INSERT INTO users (
        username, email, password_hash,
        email_verified, verification_token, verification_expires
      )
      VALUES ($1, $2, $3, FALSE, $4, $5)
      RETURNING id
      `,
      [normalizedUsername, normalizedEmail, passwordHash, verifyToken, verifyExpires]
    );

    const userId = created.rows[0].id;

    try {
      await sendVerificationEmail(normalizedEmail, verifyToken);
    } catch (mailErr) {
      console.error("POST /auth/register mail error:", mailErr);
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      return res.status(500).json({
        message:
          "No se pudo enviar el correo de activación. Revisa la configuración SMTP o intenta más tarde.",
      });
    }

    return res.status(201).json({
      message: "Te enviamos un correo para activar tu cuenta.",
      requiresVerification: true,
    });
  } catch (error) {
    console.error("POST /auth/register error:", error);
    return res.status(500).json({ message: "No se pudo crear la cuenta" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "email y password son requeridos" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await pool.query(
      `SELECT id, username, email, password_hash, email_verified
       FROM users WHERE email = $1 LIMIT 1`,
      [normalizedEmail]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ message: "Email o contraseña incorrectos." });
    }

    const row = result.rows[0];
    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Email o contraseña incorrectos." });
    }

    if (!row.email_verified) {
      return res.status(403).json({
        message: "Activa tu cuenta desde el enlace que enviamos a tu correo.",
      });
    }

    const user = toPublicUser(row);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresInSeconds = 7 * 24 * 60 * 60;
    const token = jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), {
      algorithm: "HS256",
      expiresIn: expiresInSeconds,
    });
    const expiration = new Date((nowSeconds + expiresInSeconds) * 1000).toISOString();

    return res.status(200).json({ token, expiration, user });
  } catch (error) {
    console.error("POST /auth/login error:", error);
    return res.status(500).json({ message: "No se pudo iniciar sesión" });
  }
});

router.get("/verify-email", async (req, res) => {
  try {
    const raw = req.query.token;
    const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
    if (!token) {
      return res
        .status(400)
        .type("html")
        .send(
          "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body><p>Falta el token de activación.</p></body></html>"
        );
    }

    const result = await pool.query(
      "SELECT id, verification_expires FROM users WHERE verification_token = $1 LIMIT 1",
      [token]
    );
    if (result.rowCount === 0) {
      return res
        .status(400)
        .type("html")
        .send(
          "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body><p>Enlace inválido o ya utilizado.</p></body></html>"
        );
    }

    const row = result.rows[0];
    if (row.verification_expires && new Date(row.verification_expires).getTime() < Date.now()) {
      return res
        .status(400)
        .type("html")
        .send(
          "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body><p>El enlace ha caducado. Solicita uno nuevo desde la app.</p></body></html>"
        );
    }

    await pool.query(
      `UPDATE users
       SET email_verified = TRUE, verification_token = NULL, verification_expires = NULL
       WHERE id = $1`,
      [row.id]
    );

    return res
      .status(200)
      .type("html")
      .send(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Cuenta activada</title></head><body style=\"font-family:system-ui;padding:2rem\"><h1>Cuenta activada</h1><p>Ya puedes iniciar sesión en UrbanGreen.</p></body></html>"
      );
  } catch (error) {
    console.error("GET /auth/verify-email error:", error);
    return res
      .status(500)
      .type("html")
      .send("<!DOCTYPE html><html><body>Error</body></html>");
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailNorm = String(email || "").trim().toLowerCase();
    if (!emailNorm) {
      return res.status(400).json({ message: "Introduce tu email." });
    }

    const result = await pool.query(
      "SELECT id, email_verified FROM users WHERE email = $1 LIMIT 1",
      [emailNorm]
    );
    if (result.rowCount === 0 || result.rows[0].email_verified) {
      return res.json({
        message: "Si existe una cuenta pendiente, te enviamos un correo.",
      });
    }

    const verifyToken = generateVerificationToken();
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE users SET verification_token = $1, verification_expires = $2 WHERE id = $3`,
      [verifyToken, verifyExpires, result.rows[0].id]
    );

    try {
      await sendVerificationEmail(emailNorm, verifyToken);
    } catch (mailErr) {
      console.error("POST /auth/resend-verification mail error:", mailErr);
      return res.status(500).json({
        message: "No se pudo enviar el correo. Intenta más tarde.",
      });
    }

    return res.json({
      message: "Si existe una cuenta pendiente, te enviamos un correo.",
    });
  } catch (error) {
    console.error("POST /auth/resend-verification error:", error);
    return res.status(500).json({ message: "Error al reenviar." });
  }
});

module.exports = router;
