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
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ
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

async function ensurePlantChatSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plant_chat_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plant_label TEXT NOT NULL,
      context_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_plant_chat_sessions_user_id
    ON plant_chat_sessions(user_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_plant_chat_sessions_updated_at
    ON plant_chat_sessions(updated_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plant_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES plant_chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','model')),
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_plant_chat_messages_session_id
    ON plant_chat_messages(session_id, created_at ASC)
  `);
}

module.exports = { ensureAuthSchema, ensureUserPlantsSchema, ensurePlantChatSchema };

