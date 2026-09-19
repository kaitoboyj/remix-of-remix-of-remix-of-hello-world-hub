import { useEffect, useState } from "react";
import { Check, Globe, Loader2 } from "lucide-react";
import { DEFAULT_CHAT_LABEL, DEFAULT_WELCOME_MESSAGE } from "@/lib/support";
import { supportGetGlobal, supportSetGlobal } from "@/lib/support.functions";

/** Site-wide support texts: applies to every account that has no override. */
export function SupportGlobalSettings() {
  const [welcome, setWelcome] = useState(DEFAULT_WELCOME_MESSAGE);
  const [label, setLabel] = useState(DEFAULT_CHAT_LABEL);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    supportGetGlobal({ data: {} } as never)
      .then((res) => {
        if (cancelled) return;
        setWelcome(res.welcome_message ?? DEFAULT_WELCOME_MESSAGE);
        setLabel(res.chat_label ?? DEFAULT_CHAT_LABEL);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      await supportSetGlobal({
        data: {
          welcome_message: welcome.trim() || null,
          chat_label: label.trim() || null,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
        <Globe className="h-3.5 w-3.5 text-primary" /> Support texts (all accounts)
        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {saved && <Check className="h-3 w-3 text-emerald-500" />}
      </p>

      <label className="mb-2 block text-[11px] text-muted-foreground">
        Welcome message shown in every chat
        <textarea
          value={welcome}
          onChange={(e) => setWelcome(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
        />
      </label>

      <label className="mb-2 block text-[11px] text-muted-foreground">
        Text next to the chat icon
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
        />
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
      >
        Save for all accounts
      </button>

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
