const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const pool = require("../db");
const {
  generateVerificationToken,
  sendVerificationEmailBackground,
  sendPasswordResetEmailBackground,
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

/** Crea o actualiza usuario y devuelve JWT (misma lógica que POST /auth/google con access_token). */
async function googleSessionFromAccessToken(accessToken) {
  const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const err = new Error("Token de acceso de Google inválido.");
    err.statusCode = 401;
    throw err;
  }
  const u = await r.json();
  const email = u.email;
  const name = u.name || u.given_name || (email ? email.split("@")[0] : "Usuario");
  if (!email) {
    const err = new Error("No se pudo obtener el email de Google.");
    err.statusCode = 401;
    throw err;
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
  return { token: sessionToken, expiration, user };
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

const RESET_GENERIC_MESSAGE =
  "Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.";

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailNorm = String(email || "").trim().toLowerCase();
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ message: "Introduce un email válido." });
    }

    const result = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [
      emailNorm,
    ]);

    if (result.rowCount === 0) {
      return res.json({ message: RESET_GENERIC_MESSAGE });
    }

    const resetToken = generateVerificationToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
      [resetToken, resetExpires, result.rows[0].id]
    );

    sendPasswordResetEmailBackground(emailNorm, resetToken, {
      userId: result.rows[0].id,
    });

    return res.json({ message: RESET_GENERIC_MESSAGE });
  } catch (error) {
    console.error("POST /auth/forgot-password error:", error);
    return res.status(500).json({ message: "No se pudo procesar la solicitud." });
  }
});

router.get("/reset-password", async (req, res) => {
  try {
    const raw = req.query.token;
    const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
    if (!token) {
      return res
        .status(400)
        .type("html")
        .send(
          '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Enlace inválido</title></head><body style="font-family:system-ui;padding:2rem"><p>Falta el token de recuperación. Abre el enlace del correo o solicita uno nuevo desde la app.</p></body></html>'
        );
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Nueva contraseña — UrbanGreen</title>
  <style>
    :root { --green: #2f855a; --border: #e5e7eb; }
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
    h1 { color: var(--green); font-size: 1.25rem; }
    label { display: block; margin-top: 12px; font-size: 14px; }
    input { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 16px; }
    button { margin-top: 20px; width: 100%; padding: 12px; border: 0; border-radius: 8px; background: var(--green); color: #fff; font-weight: 600; font-size: 16px; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    #msg { margin-top: 12px; font-size: 14px; min-height: 1.25em; }
    #msg.err { color: #b91c1c; }
    #msg.ok { color: var(--green); }
  </style>
</head>
<body>
  <h1>Nueva contraseña</h1>
  <p>Elige una contraseña nueva (mínimo 6 caracteres).</p>
  <form id="f">
    <label for="p1">Contraseña</label>
    <input id="p1" type="password" autocomplete="new-password" required minlength="6"/>
    <label for="p2">Confirmar</label>
    <input id="p2" type="password" autocomplete="new-password" required minlength="6"/>
    <button type="submit" id="btn">Guardar</button>
  </form>
  <p id="msg" role="status"></p>
  <script>
    (function () {
      var token = ${JSON.stringify(token)};
      var form = document.getElementById("f");
      var msg = document.getElementById("msg");
      var btn = document.getElementById("btn");
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        msg.textContent = "";
        msg.className = "";
        var p1 = document.getElementById("p1").value;
        var p2 = document.getElementById("p2").value;
        if (p1 !== p2) {
          msg.className = "err";
          msg.textContent = "Las contraseñas no coinciden.";
          return;
        }
        if (p1.length < 6) {
          msg.className = "err";
          msg.textContent = "Mínimo 6 caracteres.";
          return;
        }
        btn.disabled = true;
        try {
          var r = await fetch("/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token, password: p1 }),
          });
          var data = await r.json().catch(function () { return {}; });
          if (!r.ok) {
            msg.className = "err";
            msg.textContent = data.message || "No se pudo actualizar.";
            btn.disabled = false;
            return;
          }
          msg.className = "ok";
          msg.textContent = data.message || "Listo. Ya puedes iniciar sesión en la app.";
          form.style.display = "none";
        } catch (err) {
          msg.className = "err";
          msg.textContent = "Error de conexión.";
          btn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;

    return res.status(200).type("html").send(html);
  } catch (error) {
    console.error("GET /auth/reset-password error:", error);
    return res.status(500).type("html").send("<!DOCTYPE html><html><body>Error</body></html>");
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    const tok = typeof token === "string" ? token.trim() : "";
    if (!tok || typeof password !== "string") {
      return res.status(400).json({ message: "Token y contraseña son requeridos." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    }

    const result = await pool.query(
      `SELECT id, password_reset_expires FROM users WHERE password_reset_token = $1 LIMIT 1`,
      [tok]
    );
    if (result.rowCount === 0) {
      return res.status(400).json({ message: "Enlace inválido o ya utilizado." });
    }

    const row = result.rows[0];
    if (row.password_reset_expires && new Date(row.password_reset_expires).getTime() < Date.now()) {
      return res.status(400).json({ message: "El enlace ha caducado. Solicita uno nuevo desde la app." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL
       WHERE id = $2`,
      [passwordHash, row.id]
    );

    return res.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión en la app." });
  } catch (error) {
    console.error("POST /auth/reset-password error:", error);
    return res.status(500).json({ message: "No se pudo actualizar la contraseña." });
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

    /** id_token puede tener aud del cliente nativo; aceptamos varios OAuth client IDs. */
    const idTokenAudiences = [
      googleClientId,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    ]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean);
    const idTokenAudience =
      idTokenAudiences.length > 1
        ? [...new Set(idTokenAudiences)]
        : googleClientId;

    if (tokenType === "access_token") {
      try {
        const session = await googleSessionFromAccessToken(token);
        return res.status(200).json(session);
      } catch (e) {
        const status = e.statusCode || 401;
        return res.status(status).json({ message: e.message || "Token de acceso de Google inválido." });
      }
    } else {
      const ticket = await oauth2.verifyIdToken({
        idToken: token,
        audience: idTokenAudience,
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

/**
 * Intercambia authorization code + PKCE en el servidor (Expo Go + proxy auth.expo.io).
 * El cliente OAuth "Web" de Google suele fallar si el intercambio se hace solo desde la app;
 * aquí se usa GOOGLE_WEB_CLIENT_SECRET si está definido.
 */
router.post("/google/exchange-code", async (req, res) => {
  try {
    const googleClientId = process.env.GOOGLE_WEB_CLIENT_ID;
    if (!googleClientId) {
      return res.status(501).json({
        message:
          "Google no está configurado en el servidor (GOOGLE_WEB_CLIENT_ID).",
      });
    }

    const { code, redirectUri, codeVerifier } = req.body || {};
    if (!code || typeof code !== "string" || !redirectUri || typeof redirectUri !== "string") {
      return res.status(400).json({ message: "Faltan code o redirectUri." });
    }

    const clientSecret = (process.env.GOOGLE_WEB_CLIENT_SECRET || "").trim();
    if (!clientSecret) {
      return res.status(503).json({
        message:
          "Falta GOOGLE_WEB_CLIENT_SECRET en el servidor. En Google Cloud → APIs y servicios → Credenciales, abre tu cliente OAuth tipo «Aplicación web», copia el «Secreto del cliente» y en Render añade la variable GOOGLE_WEB_CLIENT_SECRET con ese valor (luego redeploy o reinicia el servicio).",
      });
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: code.trim(),
      redirect_uri: redirectUri.trim(),
      client_id: googleClientId,
      client_secret: clientSecret,
      code_verifier: typeof codeVerifier === "string" ? codeVerifier : "",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("POST /auth/google/exchange-code Google token error:", tokenJson);
      const detail = tokenJson.error_description || tokenJson.error;
      return res.status(401).json({
        message: detail
          ? `No se pudo intercambiar el código con Google: ${detail}`
          : "No se pudo intercambiar el código con Google.",
      });
    }

    if (!tokenJson.access_token) {
      return res.status(502).json({ message: "Google no devolvió access_token." });
    }

    try {
      const session = await googleSessionFromAccessToken(tokenJson.access_token);
      return res.status(200).json(session);
    } catch (e) {
      const status = e.statusCode || 401;
      return res.status(status).json({ message: e.message || "No se pudo completar la sesión." });
    }
  } catch (error) {
    console.error("POST /auth/google/exchange-code error:", error);
    return res.status(500).json({ message: "Error al completar el inicio con Google." });
  }
});

module.exports = router;
