const app = require("./app");
const { ensureAuthSchema } = require("./services/authSchema");

const PORT = process.env.PORT || 3000;

(async () => {
  await ensureAuthSchema();
  app.listen(PORT, () => {
    console.log(`Urban Green API running on port ${PORT}`);
  });
})().catch((error) => {
  console.error("Server startup error:", error);
  process.exit(1);
});