import { createFileRoute } from "@tanstack/react-router";
import { sendTelegramMessage, esc, truncate } from "@/lib/telegram.server";

interface VisitPayload {
  path?: string;
  referrer?: string;
  language?: string;
  languages?: string[];
  timezone?: string;
  screen?: string;
  viewport?: string;
  device?: string;
  os?: string;
  browser?: string;
  user_agent?: string;
}

interface GeoInfo {
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
  query?: string;
}

async function lookupGeo(ip: string): Promise<GeoInfo | null> {
  if (!ip) return null;
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as GeoInfo & { status?: string };
    if (data.status && data.status !== "success") return null;
    return data;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/visit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: VisitPayload = {};
        try {
          body = (await request.json()) as VisitPayload;
        } catch {
          /* ignore */
        }

        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-nf-client-connection-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip") ||
          "";

        const geo = await lookupGeo(ip);

        const lines: string[] = [
          "🌍✨🌎✨🌏✨🌍✨🌎✨🌏✨",
          "🚨 <b>NEW VISITOR ON PRIMECAPITAL</b> 🚨",
          "🌍✨🌎✨🌏✨🌍✨🌎✨🌏✨",
        ];

        if (geo) {
          const loc = [geo.city, geo.regionName, geo.country].filter(Boolean).join(", ");
          if (loc) lines.push(`📍 <b>Location:</b> ${esc(truncate(loc, 140))}`);
          if (geo.countryCode) lines.push(`🏳️ <b>Country:</b> ${esc(geo.country ?? "")} (${esc(geo.countryCode)})`);
          if (geo.regionName) lines.push(`🗺️ <b>State/Region:</b> ${esc(truncate(geo.regionName, 60))}`);
          if (geo.city) lines.push(`🏙️ <b>City:</b> ${esc(truncate(geo.city, 60))}`);
          if (geo.zip) lines.push(`📮 <b>Zip:</b> <code>${esc(geo.zip)}</code>`);
          if (geo.lat != null && geo.lon != null)
            lines.push(`🧭 <b>Coords:</b> <code>${geo.lat}, ${geo.lon}</code> — https://maps.google.com/?q=${geo.lat},${geo.lon}`);
          if (geo.timezone) lines.push(`🕒 <b>Timezone:</b> ${esc(geo.timezone)}`);
          if (geo.isp) lines.push(`📶 <b>ISP / Mobile Network:</b> ${esc(truncate(geo.isp, 80))}`);
          if (geo.org && geo.org !== geo.isp) lines.push(`🏢 <b>Org:</b> ${esc(truncate(geo.org, 80))}`);
          if (geo.as) lines.push(`🛰️ <b>AS:</b> <code>${esc(truncate(geo.as, 80))}</code>`);
          const flags: string[] = [];
          if (geo.mobile) flags.push("📱 Mobile");
          if (geo.proxy) flags.push("🕵️ Proxy/VPN");
          if (geo.hosting) flags.push("☁️ Hosting");
          if (flags.length) lines.push(`🚦 ${flags.join(" · ")}`);
        } else {
          lines.push("📍 <i>Location lookup unavailable</i>");
        }

        if (ip) lines.push(`🌐 <b>IP:</b> <code>${esc(ip)}</code>`);
        if (body.path) lines.push(`📄 <b>Page:</b> <code>${esc(truncate(body.path, 160))}</code>`);
        if (body.referrer) lines.push(`↩️ <b>Referrer:</b> ${esc(truncate(body.referrer, 160))}`);
        if (body.device) lines.push(`💻 <b>Device:</b> ${esc(truncate(body.device, 80))}`);
        if (body.os) lines.push(`🖥️ <b>OS:</b> ${esc(truncate(body.os, 60))}`);
        if (body.browser) lines.push(`🧭 <b>Browser:</b> ${esc(truncate(body.browser, 60))}`);
        if (body.language) lines.push(`🗣️ <b>Language:</b> ${esc(truncate(body.language, 40))}`);
        if (body.timezone) lines.push(`⏰ <b>Client TZ:</b> ${esc(truncate(body.timezone, 60))}`);
        if (body.screen) lines.push(`🖼️ <b>Screen:</b> <code>${esc(truncate(body.screen, 40))}</code>`);
        if (body.viewport) lines.push(`📐 <b>Viewport:</b> <code>${esc(truncate(body.viewport, 40))}</code>`);
        if (body.user_agent) lines.push(`🧾 <i>${esc(truncate(body.user_agent, 200))}</i>`);

        lines.push("🌍✨🌎✨🌏✨🌍✨🌎✨🌏✨");

        await sendTelegramMessage(lines.join("\n"));
        return Response.json({ ok: true });
      },
    },
  },
});
