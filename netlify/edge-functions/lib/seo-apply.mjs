// Pure helpers of the edge function seo-meta (kept apart so they can be tested in node).
// They write the owner's texts (table site_seo, edited in Admin -> "גוגל ותצוגת קישור") into the page's <title> and
// meta tags before the page leaves the server, so Google and link previews (WhatsApp, Facebook) see them.

// which row of site_seo a path uses
export const pageKey = (pathname) => (pathname === "/welcome" ? "welcome" : pathname === "/assistant" ? "assistant" : "default");

// text inside an HTML attribute or element: nothing the owner types can break out of it
export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const clean = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

// An empty field leaves the page as it is. A tag that is not found is left alone (nothing is added or broken).
export function applySeo(html, row) {
  if (!row || typeof html !== "string") return html;
  let out = html;
  const title = clean(row.title);
  const description = clean(row.description);
  const ogTitle = clean(row.og_title);
  const ogDescription = clean(row.og_description);
  if (title) out = out.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`);
  if (description) out = out.replace(/<meta name="description" content="[^"]*"\s*\/?>/, () => `<meta name="description" content="${esc(description)}" />`);
  if (ogTitle) out = out.replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, () => `<meta property="og:title" content="${esc(ogTitle)}" />`);
  if (ogDescription) out = out.replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, () => `<meta property="og:description" content="${esc(ogDescription)}" />`);
  return out;
}
