const crypto = require("crypto");
const nodemailer = require("nodemailer");

function getMailTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

function getPublicApiBase() {
  const fromEnv =
    process.env.PUBLIC_API_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";
  if (fromEnv) {
    return String(fromEnv).replace(/\/$/, "");
  }
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

function getMailFrom() {
  return (
    process.env.MAIL_FROM ||
    process.env.RESEND_FROM ||
    '"UrbanGreen" <onboarding@resend.dev>'
  );
}

function buildVerificationMailParts(token) {
  const base = getPublicApiBase();
  const link = `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
  const text = `Hola,\n\nActiva tu cuenta abriendo este enlace (caduca en 24 horas):\n${link}\n\nSi no creaste esta cuenta, ignora este mensaje.`;
  const html = `<p>Hola,</p><p><a href="${link}">Activa tu cuenta en UrbanGreen</a></p><p>El enlace caduca en 24 horas.</p>`;
  return { link, text, html };
}

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key || !String(key).trim()) {
    return null;
  }
  const { Resend } = require("resend");
  return new Resend(String(key).trim());
}

function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Envío síncrono (await). Usar desde tests o tareas; en HTTP preferir sendVerificationEmailBackground.
 */
async function sendVerificationEmail(to, token) {
  const from = getMailFrom();
  const { link, text, html } = buildVerificationMailParts(token);

  const resend = getResendClient();
  if (resend) {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject: "Activa tu cuenta en UrbanGreen",
      text,
      html,
    });
    if (error) {
      const err = new Error(error.message || "Resend API error");
      err.name = "ResendError";
      err.resend = error;
      throw err;
    }
    console.log("[verify-email] Resend enviado ok", { to, id: data?.id });
    return;
  }

  const transport = getMailTransport();
  if (!transport) {
    console.warn("[verify-email] Sin RESEND_API_KEY ni SMTP_HOST. Enlace de activación:");
    console.warn(link);
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject: "Activa tu cuenta en UrbanGreen",
    text,
    html,
  });
  console.log("[verify-email] SMTP enviado ok", { to });
}

function buildPasswordResetMailParts(token) {
  const base = getPublicApiBase();
  const link = `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const text = `Hola,\n\nRestablece tu contraseña abriendo este enlace (caduca en 1 hora):\n${link}\n\nSi no solicitaste este cambio, ignora este mensaje.`;
  const html = `<p>Hola,</p><p><a href="${link}">Restablecer contraseña en UrbanGreen</a></p><p>El enlace caduca en 1 hora.</p><p>Si no fuiste tú, ignora este correo.</p>`;
  return { link, text, html };
}

async function sendPasswordResetEmail(to, token) {
  const from = getMailFrom();
  const { link, text, html } = buildPasswordResetMailParts(token);

  const resend = getResendClient();
  if (resend) {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject: "Restablecer contraseña — UrbanGreen",
      text,
      html,
    });
    if (error) {
      const err = new Error(error.message || "Resend API error");
      err.name = "ResendError";
      err.resend = error;
      throw err;
    }
    console.log("[reset-password] Resend enviado ok", { to, id: data?.id });
    return;
  }

  const transport = getMailTransport();
  if (!transport) {
    console.warn("[reset-password] Sin RESEND_API_KEY ni SMTP_HOST. Enlace:");
    console.warn(link);
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject: "Restablecer contraseña — UrbanGreen",
    text,
    html,
  });
  console.log("[reset-password] SMTP enviado ok", { to });
}

function sendPasswordResetEmailBackground(to, token, meta = {}) {
  const { userId } = meta;
  const label =
    userId !== undefined && userId !== null
      ? `[reset-password bg userId=${userId}]`
      : "[reset-password bg]";

  console.log(`${label} encolando envío to=${to}`);

  setImmediate(() => {
    sendPasswordResetEmail(to, token)
      .then(() => {
        console.log(`${label} envío completado to=${to}`);
      })
      .catch((err) => {
        console.error(`${label} fallo envío to=${to}`);
        console.error(err);
        if (err.code) {
          console.error(`${label} err.code=${err.code}`);
        }
        if (err.resend) {
          console.error(`${label} Resend error payload:`, err.resend);
        }
      });
  });
}

/**
 * Encola el envío tras la respuesta HTTP; errores solo en logs.
 * @param {string} to
 * @param {string} token
 * @param {{ userId?: string|number }} [meta]
 */
function sendVerificationEmailBackground(to, token, meta = {}) {
  const { userId } = meta;
  const label =
    userId !== undefined && userId !== null
      ? `[verify-email bg userId=${userId}]`
      : "[verify-email bg]";

  console.log(`${label} encolando envío to=${to}`);

  setImmediate(() => {
    sendVerificationEmail(to, token)
      .then(() => {
        console.log(`${label} envío completado to=${to}`);
      })
      .catch((err) => {
        console.error(`${label} fallo envío to=${to}`);
        console.error(err);
        if (err.code) {
          console.error(`${label} err.code=${err.code}`);
        }
        if (err.resend) {
          console.error(`${label} Resend error payload:`, err.resend);
        }
      });
  });
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
  sendVerificationEmailBackground,
  sendPasswordResetEmail,
  sendPasswordResetEmailBackground,
};
