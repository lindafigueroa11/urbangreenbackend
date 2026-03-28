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

function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function sendVerificationEmail(to, token) {
  const base = getPublicApiBase();
  const link = `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
  const from = process.env.MAIL_FROM || '"UrbanGreen" <noreply@localhost>';

  const transport = getMailTransport();
  if (!transport) {
    console.warn("[verify-email] SMTP no configurado. Enlace de activación para " + to + ":");
    console.warn(link);
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject: "Activa tu cuenta en UrbanGreen",
    text: `Hola,\n\nActiva tu cuenta abriendo este enlace (caduca en 24 horas):\n${link}\n\nSi no creaste esta cuenta, ignora este mensaje.`,
    html: `<p>Hola,</p><p><a href="${link}">Activa tu cuenta en UrbanGreen</a></p><p>El enlace caduca en 24 horas.</p>`,
  });
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
};
