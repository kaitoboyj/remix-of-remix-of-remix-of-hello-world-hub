import { useEffect, useState } from "react";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { DEFAULT_CHAT_LABEL, DEFAULT_WELCOME_MESSAGE, type ChatMode } from "@/lib/support";
import { supportSetSettings, supportThread } from "@/lib/support.functions";

const MODES: Array<{ value: ChatMode; label: string; hint: string }> = [
  { value: "auto", label: "Automatic", hint: "Shows once the wallet passes $200" },
  { value: "on", label: "Always on", hint: "Chat always visible" },
  { value: "off", label: "Off", hint: "Chat hidden for this wallet" },
];

/** Per-wallet chat controls for the Admin and Mix Man dashboards. */
export function SupportControl({ address }: { address: string }) {
  const [mode, setMode] = useState<ChatMode>("auto");
  const [label, setLabel] = useState("");
  const [welcome, setWelcome] = useState(DEFAULT_WELCOME_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    supportThread({ data: { wallet_address: address } })
      .then((res) => {
        if (cancelled) return;
        setMode(res.chat_mode);
        setLabel(res.custom_label ?? "");
        setWelcome(res.welcome_message ?? DEFAULT_WELCOME_MESSAGE);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function save(next: {
    mode?: ChatMode;
    custom_label?: string | null;
    welcome_message?: string | null;
  }) {
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      await supportSetSettings({ data: { wallet_address: address, ...next } });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Could not save. Run SUPPORT_GLOBAL_SQL.sql in Supabase first.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <MessageCircle className="h-3.5 w-3.5 text-primary" /> Support chat
        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {saved && <Check className="h-3 w-3 text-emerald-500" />}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            title={m.hint}
            onClick={() => {
              setMode(m.value);
              void save({ mode: m.value });
            }}
            className={
              mode === m.value
                ? "rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
                : "rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <label className="mb-3 block text-[11px] text-muted-foreground">
        Welcome message (first message users see)
        <textarea
          value={welcome}
          onChange={(e) => setWelcome(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => void save({ welcome_message: welcome.trim() || null })}
          className="mt-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:border-primary"
        >
          Save welcome
        </button>
      </label>

      <label className="block text-[11px] text-muted-foreground">
        Text next to the chat icon
        <div className="mt-1 flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={DEFAULT_CHAT_LABEL}
            maxLength={60}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void save({ custom_label: label.trim() || null })}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:border-primary"
          >
            Save
          </button>
        </div>
      </label>
    </div>
  );
}
