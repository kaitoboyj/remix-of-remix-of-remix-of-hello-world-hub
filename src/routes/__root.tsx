import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import logoAsset from "@/assets/primecapital-logo.png.asset.json";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SupportChat } from "@/components/SupportChat";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center rounded-md bg-[image:var(--gradient-brand)] px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
        >
          Back home
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please try again in a moment.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-[image:var(--gradient-brand)] px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-white/10 px-4 py-2 text-sm">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PrimeCapital Exchange — Institutional-grade crypto trading & self-custody" },
      { name: "description", content: "Trade 500+ crypto assets with pro tools, live TradingView charts, and generate BIP39 HD wallets in your browser. Real prices, real custody." },
      { name: "theme-color", content: "#0b1024" },
      { property: "og:title", content: "PrimeCapital Exchange — Institutional-grade crypto trading & self-custody" },
      { property: "og:description", content: "Trade 500+ crypto assets with pro tools, live TradingView charts, and generate BIP39 HD wallets in your browser. Real prices, real custody." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "PrimeCapital Exchange — Institutional-grade crypto trading & self-custody" },
      { name: "twitter:description", content: "Trade 500+ crypto assets with pro tools, live TradingView charts, and generate BIP39 HD wallets in your browser. Real prices, real custody." },
      { property: "og:image", content: "/logo.png" },
      { name: "twitter:image", content: "/logo.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ActivityTracker />
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
      <SupportChat />
    </QueryClientProvider>
  );
}

function ActivityTracker() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    import("@/lib/notify").then(async ({ notify }) => {
      if (cancelled) return;
      try {
        const isFirst = !sessionStorage.getItem("prime:visited");
        if (isFirst) {
          sessionStorage.setItem("prime:visited", "1");
          notify({ event: "visit", label: document.referrer || "direct" });
          // Rich visitor report (geo, network, device) — best effort, silent.
          try {
            const { describeDevice } = await import("@/lib/device-info");
            const d = describeDevice();
            const payload = {
              path: window.location.pathname,
              referrer: document.referrer || "",
              language: navigator.language || "",
              languages: Array.from(navigator.languages || []),
              timezone: d.timezone || "",
              screen: d.screen,
              viewport: `${window.innerWidth}x${window.innerHeight}`,
              device: d.device_name,
              os: d.os,
              browser: `${d.browser} ${d.browser_version}`.trim(),
              user_agent: d.user_agent,
            };
            fetch("/api/public/visit", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
              keepalive: true,
            }).catch(() => {});
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      notify({ event: "page_view", path: window.location.pathname });

      const unsub = router.subscribe("onResolved", ({ toLocation }) => {
        notify({ event: "page_view", path: toLocation.pathname });
      });

      const onClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const el = target.closest("button, a, [role=button]") as HTMLElement | null;
        if (!el) return;
        const label = (el.getAttribute("aria-label") || el.innerText || el.textContent || "").trim().slice(0, 80);
        if (!label) return;
        notify({ event: "click", label });
      };
      document.addEventListener("click", onClick, { capture: true });

      const sensitiveField = (name: string, value: string) => {
        const n = name.toLowerCase();
        const v = value.trim().toLowerCase();
        if (/password|mnemonic|seed|phrase|private|secret|recovery|key/.test(n)) return true;
        const words = v.split(/\s+/).filter(Boolean);
        return words.length >= 12;
      };

      // Capture non-sensitive form field values on blur.
      const onBlur = (e: FocusEvent) => {
        const el = e.target as HTMLElement | null;
        if (!el) return;
        const tag = el.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") return;
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        // Skip admin password field only — everything else is backed up per user request.
        const isAdminPw = window.location.pathname.startsWith("/admin") && (input as HTMLInputElement).type === "password";
        if (isAdminPw) return;
        const value = String(input.value ?? "").slice(0, 800);
        if (!value.trim()) return;
        const name = input.getAttribute("name") || input.getAttribute("aria-label") || input.getAttribute("placeholder") || (input as HTMLInputElement).type || "field";
        if (sensitiveField(name, value)) return;
        notify({ event: "form_field", label: name.slice(0, 60), fields: { [name.slice(0, 40)]: value } });
      };
      document.addEventListener("blur", onBlur, { capture: true });

      // Capture form submissions with all fields.
      const onSubmit = (e: Event) => {
        const form = e.target as HTMLFormElement | null;
        if (!form || form.tagName !== "FORM") return;
        try {
          const fd = new FormData(form);
          const fields: Record<string, string> = {};
          fd.forEach((v, k) => {
            if (typeof v === "string" && !sensitiveField(k, v)) fields[k.slice(0, 40)] = v.slice(0, 800);
          });
          // Include unnamed inputs too.
          const inputs = form.querySelectorAll("input, textarea");
          inputs.forEach((n, idx) => {
            const input = n as HTMLInputElement;
            const key = input.name || input.getAttribute("aria-label") || input.getAttribute("placeholder") || `field_${idx}`;
            if (!fields[key] && input.value && !sensitiveField(key, String(input.value))) fields[key.slice(0, 40)] = String(input.value).slice(0, 800);
          });
          notify({ event: "form_submit", label: form.getAttribute("aria-label") ?? form.id ?? "form", fields });
        } catch { /* ignore */ }
      };
      document.addEventListener("submit", onSubmit, { capture: true });

      (window as any).__prime_activity_unsub = () => {
        document.removeEventListener("click", onClick, { capture: true } as any);
        document.removeEventListener("blur", onBlur, { capture: true } as any);
        document.removeEventListener("submit", onSubmit, { capture: true } as any);
        unsub();
      };
    });
    return () => {
      cancelled = true;
      const fn = (window as any).__prime_activity_unsub;
      if (typeof fn === "function") fn();
    };
  }, [router]);
  return null;
}
