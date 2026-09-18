// Shared (client-safe) support-chat helpers.

/** A wallet must have moved at least this much, in USD, before the chat bubble shows. */
export const CHAT_MIN_USD = 200;

export type ChatMode = "auto" | "on" | "off";

export const CHAT_MODE_CODE: Record<ChatMode, number> = { auto: 0, on: 1, off: 2 };

export function decodeChatMode(code: number | null | undefined): ChatMode {
  return code === 1 ? "on" : code === 2 ? "off" : "auto";
}

export const DEFAULT_CHAT_LABEL = "Contact support";

/** Shown as the first message in every support chat unless an admin edits it. */
export const DEFAULT_WELCOME_MESSAGE = "Official Prime Capital Support\nyou are welcome";

export interface SupportMessage {
  id: string;
  sender: "user" | "admin";
  body: string;
  created_at: string;
}

export interface SupportThreadSummary {
  wallet_address: string;
  username: string | null;
  custom_label: string | null;
  chat_mode: ChatMode;
  last_message_at: string | null;
  unread_admin: number;
  preview: string | null;
}

/** Whether the floating chat bubble should be visible for this wallet. */
export function shouldShowChat(mode: ChatMode, totalUsd: number) {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return totalUsd > CHAT_MIN_USD;
}

const TOTAL_PREFIX = "prime:total:";

/** The wallet page records its total USD value here so the bubble can gate on it. */
export function rememberWalletTotal(address: string, totalUsd: number) {
  if (typeof window === "undefined" || !address) return;
  try {
    localStorage.setItem(`${TOTAL_PREFIX}${address.toLowerCase()}`, String(totalUsd));
  } catch {
    /* ignore */
  }
}

export function readWalletTotal(address: string): number {
  if (typeof window === "undefined" || !address) return 0;
  try {
    const raw = localStorage.getItem(`${TOTAL_PREFIX}${address.toLowerCase()}`);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
