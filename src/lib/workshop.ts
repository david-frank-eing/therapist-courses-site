import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The upcoming workshop, the "about me" block and the pop-up texts (table site_workshop, one row, edited by the owner
// in Admin -> "סדנה" before every workshop). Public to read, admin-only to write.
// If the table or the row is missing, or the workshop is switched off, the site simply shows nothing about a workshop
// (in development the default text is shown so the page can be previewed). The "about me" block and the pop-up texts
// fall back to the default text when a field is empty, so a text can never end up blank by accident.

export interface Workshop {
  enabled: boolean;
  badge: string;
  title: string;
  kind: string;
  date_text: string;
  duration_text: string;
  price_text: string;
  location_text: string;
  description: string;
  button_text: string;
  register_url: string;
  about_title: string;
  about_text: string;
  about_quote: string;
  about_button: string;
  popup_button: string;
  popup_form_title: string;
  popup_submit: string;
  popup_thanks_title: string;
  popup_thanks_text: string;
}

// the text David approved on 23-24/11/2026; the admin screen offers it as the starting point
export const WORKSHOP_DEFAULTS: Workshop = {
  enabled: true,
  badge: "הסדנה הקרובה",
  title: "מטפל טוב זה כבר לא מספיק",
  kind: "סדנה פרונטלית",
  date_text: "29.12.26",
  duration_text: "4.5 שעות כולל הפסקה",
  price_text: "79 ₪ בהרשמה מוקדמת",
  location_text: "",
  description:
    "סיפורים, תובנות והבנה עמוקה של הדרך שבה אדם זר הופך למטופל שלכם. בלי מחשבים ובלי לרשום כל מילה: כל החומרים נשלחים אליכם אחרי הסדנה.",
  button_text: "אני רוצה להירשם",
  register_url: "",
  about_title: "מי אני",
  about_text:
    "אני דוד פרנק, מטפל רפואי וספורטיבי כבר כ־25 שנה, מרצה ומדריך מטפלים. הקמתי את \"הכול בידיים\" כדי לתת למטפלים את מה שלא מלמדים בלימודי הטיפול: איך לבנות קליניקה שאנשים מכירים ובוחרים בה.",
  about_quote: "אם יש לכם יכולת לעזור לאנשים, מגיע להם לפחות לדעת שאתם קיימים.",
  about_button: "לפרטים ולהרשמה לסדנה",
  popup_button: "הסדנה הקרובה · לפרטים",
  popup_form_title: "לקבלת מידע על הסדנה",
  popup_submit: "שלחו לי מידע",
  popup_thanks_title: "תודה, הפרטים התקבלו",
  popup_thanks_text: "נחזור אליכם עם כל המידע על הסדנה.",
};

export const WORKSHOP_FIELDS = Object.keys(WORKSHOP_DEFAULTS) as (keyof Workshop)[];

// fields that must never be blank: an empty value falls back to the default text
const FALLBACK_KEYS: (keyof Workshop)[] = [
  "about_title", "about_text", "about_quote", "about_button", "popup_button", "popup_form_title", "popup_submit", "popup_thanks_title", "popup_thanks_text",
];

export const withDefaults = (row: Partial<Workshop> | null): Workshop => {
  const out = { ...WORKSHOP_DEFAULTS, ...(row ?? {}) } as Workshop;
  for (const k of FALLBACK_KEYS) if (!String(row?.[k] ?? "").trim()) (out as unknown as Record<string, unknown>)[k] = WORKSHOP_DEFAULTS[k];
  return out;
};

// only a plain https address may become a link (never javascript: or anything else); the database enforces the same
export const safeUrl = (u: string): string => (/^https:\/\/[^\s]+$/.test(u.trim()) ? u.trim() : "");

// the small facts under the title, skipping empty ones
export const workshopFacts = (w: Workshop): { key: "kind" | "date" | "duration" | "price" | "location"; text: string }[] =>
  ([
    { key: "kind", text: w.kind },
    { key: "date", text: w.date_text },
    { key: "duration", text: w.duration_text },
    { key: "price", text: w.price_text },
    { key: "location", text: w.location_text },
  ] as const).filter((f) => f.text.trim() !== "");

// the note that travels with a lead from the pop-up, so the owner knows which workshop the person asked about
export const workshopNote = (w: Workshop): string => `מעוניין/ת בסדנה: ${w.title}${w.date_text ? ` (${w.date_text})` : ""}`.slice(0, 500);

export const OPEN_WORKSHOP_EVENT = "open-workshop";
export const openWorkshop = () => window.dispatchEvent(new Event(OPEN_WORKSHOP_EVENT));

// texts: always available (defaults where the row is missing or a field is empty).
// workshop: only when the owner switched it on and gave it a name, otherwise null (nothing about a workshop is shown).
export const useWorkshop = (): { workshop: Workshop | null; texts: Workshop; isLoading: boolean } => {
  const { data, isLoading } = useQuery({
    queryKey: ["site_workshop"],
    queryFn: async (): Promise<Workshop | null> => {
      const { data, error } = await (supabase as any).from("site_workshop").select("*").eq("id", 1).maybeSingle();
      if (error || !data) return null;
      return data as Workshop;
    },
    staleTime: 60 * 1000,
  });
  if (isLoading) return { workshop: null, texts: withDefaults(null), isLoading: true };
  // development only: preview the page before the table exists
  const row = data ?? (import.meta.env.DEV ? WORKSHOP_DEFAULTS : null);
  const texts = withDefaults(row);
  if (!row || !row.enabled || !row.title.trim()) return { workshop: null, texts, isLoading: false };
  return { workshop: texts, texts, isLoading: false };
};
