-- Run this ONCE in your Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Adds the editable welcome message shown at the top of every support chat.

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS welcome_message TEXT;
