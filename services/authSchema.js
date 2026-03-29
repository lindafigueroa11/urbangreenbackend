const pool = require("../db");

async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ
  `);
}

async function ensureUserPlantsSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_plants (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      scientific_name TEXT,
      plant_type TEXT,
      confidence REAL,
      water_need TEXT,
      watering_times TEXT NOT NULL,
      watering_note TEXT,
      classification_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_plants_user_id ON user_plants(user_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_plants_created_at ON user_plants(created_at DESC)
  `);
}

module.exports = { ensureAuthSchema, ensureUserPlantsSchema };

