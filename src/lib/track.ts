// Counts a visit to a public page (no cookies, no personal data). Once per browser session per page, and it never
// throws: a failed count must not affect the visitor. The numbers appear in Admin -> "העוזר" -> "סטטיסטיקה".

export type TrackedPage = "welcome" | "assistant";

export const trackPage = (page: TrackedPage) => {
  try {
    const key = `viewed-${page}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const src = new URLSearchParams(window.location.search).get("src") ?? "";
    void fetch("/.netlify/functions/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, src }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* no storage or no network: nothing to count */
  }
};
