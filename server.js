const app = require("./app");
const { ensureAuthSchema } = require("./services/authSchema");

const PORT = process.env.PORT || 3000;

async function ensureAuthSchemaWithRetry(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await ensureAuthSchema();
      console.log("Auth schema is ready.");
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      console.error(`Auth schema init failed (attempt ${attempt}/${maxAttempts}):`, error);
      if (isLastAttempt) {
        console.error("Auth schema could not be initialized. Server will continue running.");
        return;
      }
      const waitMs = attempt * 2000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

app.listen(PORT, () => {
  console.log(`Urban Green API running on port ${PORT}`);
  ensureAuthSchemaWithRetry().catch((error) => {
    console.error("Unexpected schema initialization error:", error);
  });
});