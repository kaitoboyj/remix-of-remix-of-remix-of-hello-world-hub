-- ============================================================================
-- Prime Capital — SUPPORT CHAT SETUP (run this ONCE in the Supabase SQL editor)
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again at any time: every statement is idempotent.
-- This single file replaces SUPPORT_CHAT_SQL.sql, WELCOME_MESSAGE_SQL.sql and
-- SUPPORT_GLOBAL_SQL.sql (those are kept only for history).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.support_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  username TEXT,
  custom_label TEXT,
  -- 0 = automatic ($200+ rule), 1 = always show, 2 = always hide
  chat_mode SMALLINT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  unread_admin INTEGER NOT NULL DEFAULT 0,
  unread_user INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added later than the table itself, so keep it separate.
ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS custom_label TEXT;
ALTER TABLE public.support_threads
  ALTER COLUMN unread_user SET DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'admin')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_settings (
  id SMALLINT NOT NULL PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  welcome_message TEXT,
  chat_label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.support_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS support_messages_thread_idx
  ON public.support_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_created_idx
  ON public.support_messages (created_at);
CREATE INDEX IF NOT EXISTS support_threads_last_message_idx
  ON public.support_threads (last_message_at DESC NULLS LAST);

GRANT ALL ON public.support_threads TO service_role;
GRANT ALL ON public.support_messages TO service_role;
GRANT ALL ON public.support_settings TO service_role;

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;

-- Everything goes through server-side code with the service key, so browsers
-- get no direct access at all.
DROP POLICY IF EXISTS "No direct client access to support threads" ON public.support_threads;
CREATE POLICY "No direct client access to support threads"
  ON public.support_threads FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "No direct client access to support messages" ON public.support_messages;
CREATE POLICY "No direct client access to support messages"
  ON public.support_messages FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "No direct client access to support settings" ON public.support_settings;
CREATE POLICY "No direct client access to support settings"
  ON public.support_settings FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Housekeeping: chat history older than 4 days is also cleared by the site
-- itself every time a chat or the inbox is opened.
DELETE FROM public.support_messages WHERE created_at < now() - INTERVAL '4 days';

-- Existing conversations with no saved messages should show the welcome badge.
UPDATE public.support_threads AS thread
SET unread_user = 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_messages AS message WHERE message.thread_id = thread.id
);
