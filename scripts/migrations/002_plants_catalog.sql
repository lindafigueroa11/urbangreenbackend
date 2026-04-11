-- Catálogo de plantas + plant_type en devices (también se aplica al arrancar server.js)
-- Ejecutar en Supabase SQL Editor si no usas el arranque automático de Node.

CREATE TABLE IF NOT EXISTS public.plants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  min_soil_moisture NUMERIC NOT NULL,
  max_soil_moisture NUMERIC NOT NULL,
  scientific_name TEXT,
  plant_category TEXT,
  water_need TEXT,
  sun_exposure TEXT,
  soil_preference TEXT,
  climate_preference TEXT,
  notes TEXT
);

ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS plant_type TEXT;
