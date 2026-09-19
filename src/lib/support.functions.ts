import { createServerFn } from "@tanstack/react-start";
import { CHAT_MODE_CODE, decodeChatMode, type ChatMode } from "./support";

function normAddr(a: string) {
  const s = String(a ?? "").trim();
  if (!/^[A-Za-z0-9]{20,128}$/.test(s)) throw new Error("Invalid wallet address");
  return s;
}

function normBody(b: string) {
  const s = String(b ?? "").trim().slice(0, 2000);
  if (!s) throw new Error("Message is empty");
  return s;
}

function normText(v: unknown, max: number) {
  return String(v ?? "").replace(/[\r\n\t]/g, " ").trim().slice(0, max);
}

// The support tables are created by SUPPORT_CHAT_SQL.sql, so they are not part
// of the generated Supabase types yet — use an untyped client for them.
async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as any;
}

async function ensureThread(wallet_address: string, username?: string) {
  const db = await admin();
  const { data: existing } = await db
    .from("support_threads")
    .select("id, username, custom_label, chat_mode, unread_admin, unread_user, welcome_message")
    .eq("wallet_address", wallet_address)
    .maybeSingle();
  if (existing) {
    if (username && !existing.username) {
      await db.from("support_threads").update({ username }).eq("id", existing.id);
    }
    return existing;
  }
  const { data, error } = await db
    .from("support_threads")
    // A fresh thread starts with one unread message: the welcome greeting.
    .insert({ wallet_address, username: username ?? null, unread_user: 1 })
    .select("id, username, custom_label, chat_mode, unread_admin, unread_user, welcome_message")
    .single();
  if (error) throw error;
  return data;
}

/** The user's own thread: chat visibility, label and message history. */
export const supportState = createServerFn({ method: "POST" })
  .inputValidator((d: { wallet_address: string; username?: string }) => ({
    wallet_address: normAddr(d?.wallet_address),
    username: normText(d?.username, 40),
  }))
  .handler(async ({ data }) => {
    const thread = await ensureThread(data.wallet_address, data.username || undefined);
    const db = await admin();
    const { data: messages } = await db
      .from("support_messages")
      .select("id, sender, body, created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(200);
    return {
      mode: decodeChatMode(thread.chat_mode as number),
      label: (thread.custom_label as string | null) ?? null,
      unread: Number(thread.unread_user ?? 0),
      welcome: (thread.welcome_message as string | null) ?? null,
      messages: (messages ?? []) as Array<{
        id: string;
        sender: "user" | "admin";
        body: string;
        created_at: string;
      }>,
    };
  });

/** User sends a message to support; notifies the Telegram group. */
export const supportSend = createServerFn({ method: "POST" })
  .inputValidator((d: { wallet_address: string; username?: string; body: string }) => ({
    wallet_address: normAddr(d?.wallet_address),
    username: normText(d?.username, 40),
    body: normBody(d?.body),
  }))
  .handler(async ({ data }) => {
    const thread = await ensureThread(data.wallet_address, data.username || undefined);
    const db = await admin();
    const { error } = await db
      .from("support_messages")
      .insert({ thread_id: thread.id, sender: "user", body: data.body });
    if (error) throw error;
    await db
      .from("support_threads")
      .update({
        last_message_at: new Date().toISOString(),
        unread_admin: Number(thread.unread_admin ?? 0) + 1,
        // The user's own reply is what clears the unread badge — opening the
        // chat alone never does.
        unread_user: 0,
      })
      .eq("id", thread.id);

    try {
      const { supportMessageText, sendTelegramMessage } = await import("./telegram.server");
      await sendTelegramMessage(
        supportMessageText({
          username: data.username || (thread.username as string) || "guest",
          address: data.wallet_address,
          body: data.body,
        }),
      );
    } catch {
      /* notification is best effort */
    }
    return { ok: true as const };
  });

export const supportMarkUserRead = createServerFn({ method: "POST" })
  .inputValidator((d: { wallet_address: string }) => ({ wallet_address: normAddr(d?.wallet_address) }))
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("support_threads").update({ unread_user: 0 }).eq("wallet_address", data.wallet_address);
    return { ok: true as const };
  });

// ── Staff side ───────────────────────────────────────────────────────────────

export const supportLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => ({ password: String(d?.password ?? "") }))
  .handler(async ({ data }) => {
    const { verifySupportPassword, createSupportSession } = await import("./support.server");
    if (!verifySupportPassword(data.password)) return { ok: false as const };
    const session = await createSupportSession();
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const supportLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { createSupportSession } = await import("./support.server");
  const session = await createSupportSession();
  await session.clear();
  return { ok: true as const };
});

export const supportStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { isSupportUnlocked } = await import("./support.server");
  const { isAdminUnlocked } = await import("./admin.server");
  const { isMixmanUnlocked } = await import("./mixman.server");
  const unlocked =
    (await isSupportUnlocked()) || (await isAdminUnlocked()) || (await isMixmanUnlocked());
  return { unlocked };
});

export const supportListThreads = createServerFn({ method: "POST" }).handler(async () => {
  const { requireSupportStaff } = await import("./support.server");
  await requireSupportStaff();
  const db = await admin();
  const { data: threads, error } = await db
    .from("support_threads")
    .select("id, wallet_address, username, custom_label, chat_mode, last_message_at, unread_admin")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw error;

  const list = threads ?? [];
  const previews = new Map<string, string>();
  for (const t of list) {
    const { data: last } = await db
      .from("support_messages")
      .select("body")
      .eq("thread_id", t.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.body) previews.set(t.id as string, String(last.body).slice(0, 120));
  }

  return {
    threads: list.map((t: any) => ({
      wallet_address: t.wallet_address as string,
      username: (t.username as string | null) ?? null,
      custom_label: (t.custom_label as string | null) ?? null,
      chat_mode: decodeChatMode(t.chat_mode as number),
      last_message_at: (t.last_message_at as string | null) ?? null,
      unread_admin: Number(t.unread_admin ?? 0),
      preview: previews.get(t.id as string) ?? null,
    })),
  };
});

export const supportThread = createServerFn({ method: "POST" })
  .inputValidator((d: { wallet_address: string }) => ({ wallet_address: normAddr(d?.wallet_address) }))
  .handler(async ({ data }) => {
    const { requireSupportStaff } = await import("./support.server");
    await requireSupportStaff();
    const thread = await ensureThread(data.wallet_address);
    const db = await admin();
    const { data: messages } = await db
      .from("support_messages")
      .select("id, sender, body, created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(500);
    await db.from("support_threads").update({ unread_admin: 0 }).eq("id", thread.id);
    return {
      username: (thread.username as string | null) ?? null,
      custom_label: (thread.custom_label as string | null) ?? null,
      chat_mode: decodeChatMode(thread.chat_mode as number),
      welcome_message: (thread.welcome_message as string | null) ?? null,
      messages: (messages ?? []) as Array<{
        id: string;
        sender: "user" | "admin";
        body: string;
        created_at: string;
      }>,
    };
  });

export const supportReply = createServerFn({ method: "POST" })
  .inputValidator((d: { wallet_address: string; body: string }) => ({
    wallet_address: normAddr(d?.wallet_address),
    body: normBody(d?.body),
  }))
  .handler(async ({ data }) => {
    const { requireSupportStaff } = await import("./support.server");
    await requireSupportStaff();
    const thread = await ensureThread(data.wallet_address);
    const db = await admin();
    const { error } = await db
      .from("support_messages")
      .insert({ thread_id: thread.id, sender: "admin", body: data.body });
    if (error) throw error;
    await db
      .from("support_threads")
      .update({
        last_message_at: new Date().toISOString(),
        unread_user: Number(thread.unread_user ?? 0) + 1,
      })
      .eq("id", thread.id);
    return { ok: true as const };
  });

/** Turn the chat bubble on/off for a wallet and set the label next to the icon. */
export const supportSetSettings = createServerFn({ method: "POST" })
  .inputValidator((d: {
    wallet_address: string;
    mode?: ChatMode;
    custom_label?: string | null;
    welcome_message?: string | null;
  }) => ({
    wallet_address: normAddr(d?.wallet_address),
    mode: (d?.mode === "on" || d?.mode === "off" || d?.mode === "auto" ? d.mode : undefined) as
      | ChatMode
      | undefined,
    custom_label:
      d?.custom_label === undefined ? undefined : normText(d.custom_label, 60) || null,
    welcome_message:
      d?.welcome_message === undefined
        ? undefined
        : String(d.welcome_message ?? "").trim().slice(0, 500) || null,
  }))
  .handler(async ({ data }) => {
    const { requireSupportStaff } = await import("./support.server");
    await requireSupportStaff();
    const thread = await ensureThread(data.wallet_address);
    const patch: Record<string, unknown> = {};
    if (data.mode) patch['chat_mode'] = CHAT_MODE_CODE[data.mode];
    if (data.custom_label !== undefined) patch['custom_label'] = data.custom_label;
    if (data.welcome_message !== undefined) patch['welcome_message'] = data.welcome_message;
    if (!Object.keys(patch).length) return { ok: true as const };
    const db = await admin();
    const { error } = await db.from("support_threads").update(patch).eq("id", thread.id);
    if (error) throw error;
    return { ok: true as const };
  });

// ── Global (site-wide) support texts ─────────────────────────────────────────

/** Site-wide defaults, used whenever a wallet has no per-wallet override. */
export async function readGlobalSettings(): Promise<{
  welcome_message: string | null;
  chat_label: string | null;
}> {
  try {
    const db = await admin();
    const { data } = await db
      .from("support_settings")
      .select("welcome_message, chat_label")
      .eq("id", 1)
      .maybeSingle();
    return {
      welcome_message: (data?.welcome_message as string | null) ?? null,
      chat_label: (data?.chat_label as string | null) ?? null,
    };
  } catch {
    return { welcome_message: null, chat_label: null };
  }
}

export const supportGetGlobal = createServerFn({ method: "POST" }).handler(async () => {
  const { requireSupportStaff } = await import("./support.server");
  await requireSupportStaff();
  return await readGlobalSettings();
});

/** Edit the greeting and the icon text for every account at once. */
export const supportSetGlobal = createServerFn({ method: "POST" })
  .inputValidator((d: { welcome_message?: string | null; chat_label?: string | null }) => ({
    welcome_message:
      d?.welcome_message === undefined
        ? undefined
        : String(d.welcome_message ?? "").trim().slice(0, 500) || null,
    chat_label: d?.chat_label === undefined ? undefined : normText(d.chat_label, 60) || null,
  }))
  .handler(async ({ data }) => {
    const { requireSupportStaff } = await import("./support.server");
    await requireSupportStaff();
    const patch: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
    if (data.welcome_message !== undefined) patch['welcome_message'] = data.welcome_message;
    if (data.chat_label !== undefined) patch['chat_label'] = data.chat_label;
    const db = await admin();
    const { error } = await db.from("support_settings").upsert(patch, { onConflict: "id" });
    if (error) throw new Error(error.message || "Could not save support settings");
    return { ok: true as const };
  });
