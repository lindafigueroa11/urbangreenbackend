const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const pool = require("../db");
const {
  generateVerificationToken,
  sendVerificationEmailBackground,
} = require("../services/emailVerification");
const { getJwtSecret } = require("../utils/jwtSecret");

const router = express.Router();

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

    sendVerificationEmailBackground(normalizedEmail, verifyToken, { userId });

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

    sendVerificationEmailBackground(emailNorm, verifyToken, {
      userId: result.rows[0].id,
    });

    return res.json({
      message: "Si existe una cuenta pendiente, te enviamos un correo.",
    });
  } catch (error) {
    console.error("POST /auth/resend-verification error:", error);
    return res.status(500).json({ message: "Error al reenviar." });
  }
});

router.post("/google", async (req, res) => {
  try {
    const googleClientId = process.env.GOOGLE_WEB_CLIENT_ID;
    if (!googleClientId) {
      return res.status(501).json({
        message:
          "Google no está configurado en el servidor (GOOGLE_WEB_CLIENT_ID).",
      });
    }

    const { token, tokenType } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Falta token de Google." });
    }

    const oauth2 = new OAuth2Client(googleClientId);
    let email;
    let name;

    if (tokenType === "access_token") {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        return res.status(401).json({ message: "Token de acceso de Google inválido." });
      }
      const u = await r.json();
      email = u.email;
      name = u.name || u.given_name || (email ? email.split("@")[0] : "Usuario");
    } else {
      const ticket = await oauth2.verifyIdToken({
        idToken: token,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      email = payload?.email;
      name =
        payload?.name ||
        payload?.given_name ||
        (email ? email.split("@")[0] : "Usuario");
    }

    if (!email) {
      return res.status(401).json({ message: "No se pudo obtener el email de Google." });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const nameTrim = String(name || "Usuario").trim().slice(0, 120);

    const existing = await pool.query(
      "SELECT id, username, email, email_verified FROM users WHERE email = $1 LIMIT 1",
      [emailNorm]
    );

    let userRow;
    if (existing.rowCount === 0) {
      const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
      const ins = await pool.query(
        `INSERT INTO users (username, email, password_hash, email_verified, verification_token, verification_expires)
         VALUES ($1, $2, $3, TRUE, NULL, NULL)
         RETURNING id, username, email`,
        [nameTrim, emailNorm, randomHash]
      );
      userRow = ins.rows[0];
    } else {
      userRow = existing.rows[0];
      if (!userRow.email_verified) {
        await pool.query("UPDATE users SET email_verified = TRUE WHERE id = $1", [userRow.id]);
      }
    }

    const user = toPublicUser(userRow);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresInSeconds = 7 * 24 * 60 * 60;
    const sessionToken = jwt.sign(
      { sub: user.id, email: user.email },
      getJwtSecret(),
      { algorithm: "HS256", expiresIn: expiresInSeconds }
    );
    const expiration = new Date((nowSeconds + expiresInSeconds) * 1000).toISOString();

    return res.status(200).json({
      token: sessionToken,
      expiration,
      user,
    });
  } catch (error) {
    console.error("POST /auth/google error:", error);
    return res.status(401).json({ message: "No se pudo validar el inicio de sesión con Google." });
  }
});

module.exports = router;
