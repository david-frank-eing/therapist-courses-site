// seo-meta (Netlify edge function, 24/11/2026)
// The site is a single-page app: every address returns the same index.html, so Google and link previews (WhatsApp,
// Facebook) would see the same title for every page, and the owner could only change it in the code.
// This function reads the owner's texts from the table site_seo (public to read) and writes them into the page's <title>
// and meta tags on the way out. If anything fails (no table yet, no answer within 1.5 s, an unexpected page), the page is
// returned exactly as it is: it can never break the site. Rows are cached for a minute.

import { applySeo, pageKey } from "./lib/seo-apply.mjs";

const TTL_MS = 60 * 1000;
let cache = { at: 0, rows: null };

async function loadRows() {
  if (cache.rows && Date.now() - cache.at < TTL_MS) return cache.rows;
  const url = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return cache.rows;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(`${url}/rest/v1/site_seo?select=page,title,description,og_title,og_description`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: ctl.signal,
    });
    if (!r.ok) return cache.rows;
    const rows = await r.json();
    if (Array.isArray(rows)) cache = { at: Date.now(), rows };
    return cache.rows;
  } catch {
    return cache.rows;   // an older copy, or nothing
  } finally {
    clearTimeout(timer);
  }
}

export default async (request, context) => {
  const response = await context.next();
  try {
    if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
    const rows = await loadRows();
    if (!rows) return response;
    const row = rows.find((r) => r.page === pageKey(new URL(request.url).pathname));
    if (!row) return response;
    const html = await response.clone().text();
    const out = applySeo(html, row);
    if (out === html) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(out, { status: response.status, headers });
  } catch {
    return response;
  }
};

// pages only: not the scripts, styles, images and the dashboard (which would only cost time)
export const config = {
  path: "/*",
  excludedPath: ["/assets/*", "/fonts/*", "/carlos-dashboard/*", "/.netlify/*", "/*.js", "/*.css", "/*.png", "/*.jpg", "/*.svg", "/*.ico", "/*.json", "/*.txt", "/*.webp", "/*.woff2"],
};
