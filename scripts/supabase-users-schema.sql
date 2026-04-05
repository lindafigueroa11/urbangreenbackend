-- Ejecutar en Supabase: SQL Editor → New query → Run
-- Crea la tabla de usuarios para registro email/contraseña y verificación.

CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- Opcional: comentario en el editor de Supabase
COMMENT ON TABLE public.users IS 'Auth Urban Green (backend Node), no confundir con auth.users de Supabase Auth';
