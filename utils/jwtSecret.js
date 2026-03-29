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

module.exports = { getJwtSecret };
