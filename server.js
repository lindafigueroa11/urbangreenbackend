const app = require("./app");
const { ensureAuthSchema, ensureUserPlantsSchema } = require("./services/authSchema");

const PORT = process.env.PORT || 3000;

async function ensureAuthSchemaWithRetry(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await ensureAuthSchema();
      await ensureUserPlantsSchema();
      console.log("Auth schema is ready.");
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      console.error(`Auth schema init failed (attempt ${attempt}/${maxAttempts}):`, error);
      if (isLastAttempt) {
        throw error;
      }
      const waitMs = attempt * 2000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

(async () => {
  try {
    await ensureAuthSchemaWithRetry();
  } catch (error) {
    console.error(
      "Fatal: no se pudo crear/actualizar la tabla users. Revisa DATABASE_URL y ejecuta scripts/supabase-users-schema.sql en Supabase si hace falta."
    );
    console.error(error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Urban Green API running on port ${PORT}`);
  });
})();