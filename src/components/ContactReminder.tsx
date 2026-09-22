import { useEffect, useState } from "react";
import { Phone, X, Loader2 } from "lucide-react";
import { useWalletSession } from "@/hooks/useWalletSession";
import { setSessionContact } from "@/lib/wallet-auth";
import { notify } from "@/lib/notify";

const SHOW_MS = 3000;
const HIDE_MS = 20000;

function validContact(v: string) {
  const s = v.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return true;
  return /^\+?[0-9][0-9\s\-()]{6,19}$/.test(s);
}

/**
 * Accounts without a linked phone number (or email) get a short reminder banner
 * that appears for 3 seconds every 20 seconds. Tapping it opens the form.
 */
export default function ContactReminder() {
  const session = useWalletSession();
  const missing = !!session && !session.contact;

  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!missing || open) {
      setVisible(false);
      return;
    }
    let hideTimer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setVisible(true);
      hideTimer = setTimeout(() => setVisible(false), SHOW_MS);
    };
    const first = setTimeout(cycle, 1500);
    const interval = setInterval(cycle, HIDE_MS + SHOW_MS);
    return () => {
      clearTimeout(first);
      clearTimeout(hideTimer);
      clearInterval(interval);
    };
  }, [missing, open]);

  if (!missing) return null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const clean = value.trim();
    if (!validContact(clean)) {
      setErr("Enter a valid phone number or email address.");
      return;
    }
    setBusy(true);
    setSessionContact(clean);
    notify({ event: "account_contact_linked", label: session?.username, extra: clean });
    setBusy(false);
    setOpen(false);
  };

  return (
    <>
      {visible && !open && (
        <div className="fixed inset-x-0 top-0 z-[90] flex justify-center px-3 pt-3 pointer-events-none">
          <button
            onClick={() => setOpen(true)}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-[hsl(28_95%_53%)] px-4 py-2 text-xs font-semibold text-white shadow-lg animate-in fade-in slide-in-from-top-2"
          >
            <Phone className="h-3.5 w-3.5" />
            Add a phone number or email to secure your account
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl glass p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold">Link a phone number</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Optional, but it lets support reach you and helps recover access. You can enter an
                  email address instead.
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={save} className="mt-4 space-y-3">
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="+234 801 234 5678 or you@email.com"
                className="w-full glass rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {err && <p className="text-xs text-destructive">{err}</p>}
              <button
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-brand)] py-2.5 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
