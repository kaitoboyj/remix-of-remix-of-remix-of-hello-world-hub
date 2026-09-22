import {
  lookupProfileByAddressFn,
  isUsernameTakenFn,
  recordWalletLoginFn,
  registerWalletProfileFn,
} from "@/lib/wallet-profile.functions";

// The canonical wallet identifier is the derived Ethereum address (first EVM entry).
export function walletAddressFor(addresses: { chain: string; address: string }[]): string {
  const eth = addresses.find((a) => a.chain === "ETH") ?? addresses[0];
  return eth?.address ?? "";
}

export interface WalletProfileRow {
  wallet_address: string;
  username: string;
}

export async function lookupProfileByAddress(address: string): Promise<WalletProfileRow | null> {
  const { profile } = await lookupProfileByAddressFn({ data: { wallet_address: address } });
  return profile ?? null;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const { taken } = await isUsernameTakenFn({ data: { username } });
  return taken;
}

export async function registerWalletProfile(address: string, username: string, signature: string): Promise<WalletProfileRow> {
  const { profile } = await registerWalletProfileFn({ data: { wallet_address: address, username, signature } });
  return profile;
}

export async function recordWalletLogin(
  address: string,
  event: "create" | "import" | "signin",
  signature: string,
  username?: string,
) {
  try {
    await recordWalletLoginFn({ data: {
      wallet_address: address,
      username: username ?? undefined,
      event,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : null,
      signature,
    } });
  } catch {
    /* best-effort logging */
  }
}

// --- Active-session persistence (client-only, wallet-based "login") ---

const SESSION_KEY = "prime:session:v1";

export interface WalletSession {
  address: string;
  username: string;
  /** Optional contact the user linked to the account (phone number or email). */
  contact?: string;
  wallet?: WalletSnapshot;
}

export interface WalletSnapshot {
  id: string;
  label: string;
  createdAt: number;
  mnemonic?: string;
  addresses: Array<{
    chain: string;
    name: string;
    path: string;
    address: string;
    standard: "BIP84" | "BIP44";
  }>;
}

// Chains removed from the product; filtered out of any previously stored session.
const HIDDEN_SESSION_CHAINS = new Set(["ARB", "OP", "AVAX"]);

/** Base shares the EVM address, so older sessions get it back-filled from ETH. */
function withBaseAddress(addresses: WalletSnapshot["addresses"]): WalletSnapshot["addresses"] {
  if (addresses.some((a) => a.chain === "BASE")) return addresses;
  const eth = addresses.find((a) => a.chain === "ETH");
  if (!eth) return addresses;
  return [...addresses, { ...eth, chain: "BASE", name: "Base" }];
}

/** Every account signed in on this device. */
const ACCOUNTS_KEY = "prime:accounts:v1";

function normalizeSession(session: WalletSession): WalletSession {
  if (session.wallet?.addresses) {
    session.wallet.addresses = withBaseAddress(
      session.wallet.addresses.filter((a) => !HIDDEN_SESSION_CHAINS.has(a.chain)),
    );
  }
  return session;
}

function readAccounts(): WalletSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const list = raw ? (JSON.parse(raw) as WalletSession[]) : [];
    if (Array.isArray(list) && list.length) return list.filter((s) => s?.address).map(normalizeSession);
  } catch {
    /* fall through */
  }
  // Older devices only stored the single active session — treat it as account #1.
  const active = loadSession();
  return active ? [active] : [];
}

function writeAccounts(list: WalletSession[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

function announce() {
  window.dispatchEvent(new CustomEvent("prime:session-change"));
}

export function loadSession(): WalletSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw) as WalletSession);
  } catch {
    return null;
  }
}

/** All accounts signed in on this device, active one first. */
export function listAccounts(): WalletSession[] {
  const list = readAccounts();
  const activeAddress = loadSession()?.address;
  if (!activeAddress) return list;
  return [...list].sort((a, b) =>
    a.address === activeAddress ? -1 : b.address === activeAddress ? 1 : 0,
  );
}

/** Record this device against a wallet (best-effort, never blocks the UI). */
function trackDevice(session: WalletSession) {
  void (async () => {
    try {
      const [{ describeDevice }, { recordDeviceSessionFn }] = await Promise.all([
        import("@/lib/device-info"),
        import("@/lib/devices.functions"),
      ]);
      await recordDeviceSessionFn({
        data: { ...describeDevice(), wallet_address: session.address, username: session.username ?? null },
      });
    } catch {
      /* best-effort */
    }
  })();
}

function trackDeviceLogout(address?: string) {
  if (!address) return;
  void (async () => {
    try {
      const [{ deviceId }, { markDeviceLoggedOutFn }] = await Promise.all([
        import("@/lib/device-info"),
        import("@/lib/devices.functions"),
      ]);
      await markDeviceLoggedOutFn({ data: { wallet_address: address, device_id: deviceId() } });
    } catch {
      /* best-effort */
    }
  })();
}

/** Sign in an account (or refresh it) and make it the active one. */
export function saveSession(session: WalletSession) {
  const list = readAccounts().filter((s) => s.address !== session.address);
  writeAccounts([session, ...list]);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  announce();
  trackDevice(session);
}

/** Switch the active account to another one already signed in on this device. */
export function switchAccount(address: string): WalletSession | null {
  const next = readAccounts().find((s) => s.address === address);
  if (!next) return null;
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  announce();
  trackDevice(next);
  return next;
}

/**
 * Sign out one account (defaults to the active one). Any other account signed
 * in on this device stays available and becomes active.
 */
export function clearSession(address?: string) {
  const target = address ?? loadSession()?.address;
  const remaining = readAccounts().filter((s) => s.address !== target);
  if (remaining.length) {
    writeAccounts(remaining);
    localStorage.setItem(SESSION_KEY, JSON.stringify(remaining[0]));
  } else {
    localStorage.removeItem(ACCOUNTS_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
  announce();
  trackDeviceLogout(target);
}

/** Sign out every account on this device. */
export function clearAllSessions() {
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(SESSION_KEY);
  announce();
}
