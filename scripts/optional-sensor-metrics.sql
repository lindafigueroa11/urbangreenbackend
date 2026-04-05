-- Ejecutar en Supabase (SQL Editor) si ya tienes sensor_data con NOT NULL en todo.
-- Permite ingestas con solo humedad (temperatura / suelo ausentes).

ALTER TABLE public.sensor_data
  ALTER COLUMN temperature DROP NOT NULL;

ALTER TABLE public.sensor_data
  ALTER COLUMN soil_moisture DROP NOT NULL;
