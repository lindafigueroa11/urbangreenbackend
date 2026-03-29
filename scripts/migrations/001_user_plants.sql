-- Plantas guardadas por usuario (sincronizado con ensureUserPlantsSchema en services/authSchema.js)
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
);

CREATE INDEX IF NOT EXISTS idx_user_plants_user_id ON user_plants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plants_created_at ON user_plants(created_at DESC);
