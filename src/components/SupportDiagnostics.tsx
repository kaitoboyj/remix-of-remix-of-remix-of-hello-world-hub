import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Stethoscope, XCircle } from "lucide-react";
import { supportDiagnostics } from "@/lib/support.functions";

type Check = { name: string; ok: boolean; detail: string };

/** Staff self-check: says exactly which part of the support chat is missing. */
export function SupportDiagnostics() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await supportDiagnostics({ data: {} } as never);
      setChecks(res.checks as Check[]);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not run the check");
    } finally {
      setBusy(false);
    }
  }

  const failing = (checks ?? []).filter((c) => !c.ok);

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <Stethoscope className="h-3.5 w-3.5 text-primary" /> Support chat self-check
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} Run check
      </button>

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

      {checks && (
        <ul className="mt-2 space-y-1">
          {checks.map((c) => (
            <li key={c.name} className="flex items-start gap-1.5 text-[11px]">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
              )}
              <span className={c.ok ? "text-muted-foreground" : "text-destructive"}>
                {c.name} — {c.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {checks && failing.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-500">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Run SUPPORT_SETUP_SQL.sql in the Supabase SQL editor, and make sure the database keys are
          set in the Netlify environment variables.
        </p>
      )}
    </div>
  );
}
