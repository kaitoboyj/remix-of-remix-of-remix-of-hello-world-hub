# Fix the support chat (saving texts, sending messages) + 4-day message reset

## What is going wrong

Both broken things — "Save for all accounts" and a user sending a message — go through the same
place: the server talking to your database with the service key. Everything in the chat is stored
there, so if either the key is wrong on Netlify or the chat tables were never created, both actions
fail at the same time. That matches exactly what you describe, and it also matches the earlier
"invalid API key" you saw when importing a wallet.

Right now nothing tells us which of the two it is, because the chat box silently swallows the error:
when sending fails the message just disappears with no warning. So the first job is to make the app
say what is wrong, then fix it.

Note: I cannot read your database from here (it is your own Supabase project, not connected to this
workspace), so the plan makes the running site report the exact cause instead of guessing.

## Plan

### 1. Stop hiding errors
- In the chat box, a failed send keeps the typed text and shows a short red message
  ("Couldn't send — try again") instead of silently clearing.
- Same for loading the conversation and for the admin reply box in the support inbox.

### 2. Add a self-check page
- A small check the Admin and Mix Man pages can run that reports, in plain words:
  database key present / missing, each chat table present / missing, each column present / missing.
- This turns "it doesn't work" into a one-line answer we can fix immediately.

### 3. One SQL file that sets everything up
- Replace the four separate scripts with a single re-runnable `SUPPORT_SETUP_SQL.sql` covering the
  threads table, messages table, the settings row, the welcome-message column, indexes, grants and
  policies. Running it twice is harmless.
- You run this once in your Supabase SQL editor.

### 4. Netlify environment
- Document the exact variables Netlify needs (database URL, publishable key, service key, and the
  VITE copies). A wrong or placeholder service key makes every chat action fail even with the
  tables in place.

### 5. Messages reset after 4 days
- Any chat message older than 4 days is deleted automatically, checked whenever a chat or the inbox
  is opened, so conversations stay clean without a scheduled job.
- When a thread's messages are all gone, its unread counters reset too and the welcome greeting
  shows again as the only bubble.

## Technical notes

- `src/lib/support.functions.ts`: add a `purgeOldMessages(threadId)` helper deleting
  `support_messages` where `created_at < now() - 4 days`, called from `supportState`,
  `supportThread` and `supportListThreads`; reset `unread_user`/`unread_admin` when a thread ends up
  empty. Surface real error messages from `supportSend`/`supportReply` instead of `{ ok: true }`
  on silent failure.
- New `supportDiagnostics` server fn (staff-only): probes `support_threads`, `support_messages`,
  `support_settings` and the `welcome_message` column with `select ... limit 1` and reports each
  error code; also reports whether `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are set (presence
  only, never values). Rendered by a small panel next to `SupportGlobalSettings` on `/admin` and
  `/mixman`.
- `SupportChat.tsx` / `support-inbox.tsx`: replace the empty `catch {}` blocks with error state.
- New `SUPPORT_SETUP_SQL.sql` consolidating `SUPPORT_CHAT_SQL.sql`, `WELCOME_MESSAGE_SQL.sql`,
  `SUPPORT_GLOBAL_SQL.sql`; old files kept so nothing breaks.
- No Netlify config changes; deploy stays GitHub -> Netlify.

## What you will need to do

1. Run `SUPPORT_SETUP_SQL.sql` once in your Supabase SQL editor.
2. Open the Admin page, run the new self-check, and tell me what it reports if anything is still red
   (most likely the service key on Netlify).
