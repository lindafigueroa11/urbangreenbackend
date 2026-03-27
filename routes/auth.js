const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const router = express.Router();
let warnedMissingJwtSecret = false;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }

  // Fallback only for development/testing to avoid blocking auth flows.
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
      return res.status(409).json({ message: "Ese email ya está registrado" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await pool.query(
      `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username, email
      `,
      [normalizedUsername, normalizedEmail, passwordHash]
    );

    const user = toPublicUser(created.rows[0]);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresInSeconds = 7 * 24 * 60 * 60;
    const token = jwt.sign({ sub: user.id, email: user.email }, getJwtSecret(), {
      algorithm: "HS256",
      expiresIn: expiresInSeconds,
    });
    const expiration = new Date((nowSeconds + expiresInSeconds) * 1000).toISOString();

    return res.status(201).json({ token, expiration, user });
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
      "SELECT id, username, email, password_hash FROM users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const row = result.rows[0];
    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Credenciales inválidas" });
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

module.exports = router;

