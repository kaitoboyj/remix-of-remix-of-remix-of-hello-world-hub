-- Run this ONCE in your Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Adds the editable per-wallet welcome message and the GLOBAL support texts
-- (default welcome message + default text next to the chat icon).

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS welcome_message TEXT;

CREATE TABLE IF NOT EXISTS public.support_settings (
  id SMALLINT NOT NULL PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  welcome_message TEXT,
  chat_label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.support_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.support_settings TO service_role;

ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct client access to support settings" ON public.support_settings;
CREATE POLICY "No direct client access to support settings"
  ON public.support_settings FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
