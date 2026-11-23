import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The upcoming workshop (table site_workshop, one row, edited by the owner in Admin -> "סדנה" before every workshop).
// Public to read, admin-only to write. If the table or the row is missing, or the workshop is switched off, the site
// simply shows nothing about a workshop (in development the default text is shown so the page can be previewed).

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
};

export const WORKSHOP_FIELDS = Object.keys(WORKSHOP_DEFAULTS) as (keyof Workshop)[];

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

export const useWorkshop = (): { workshop: Workshop | null; isLoading: boolean } => {
  const { data, isLoading } = useQuery({
    queryKey: ["site_workshop"],
    queryFn: async (): Promise<Workshop | null> => {
      const { data, error } = await (supabase as any).from("site_workshop").select("*").eq("id", 1).maybeSingle();
      if (error || !data) return null;
      return data as Workshop;
    },
    staleTime: 60 * 1000,
  });
  if (isLoading) return { workshop: null, isLoading: true };
  // development only: preview the page before the table exists
  const fallback = import.meta.env.DEV && !data ? WORKSHOP_DEFAULTS : null;
  const w = data ?? fallback;
  if (!w || !w.enabled || !w.title.trim()) return { workshop: null, isLoading: false };
  return { workshop: w, isLoading: false };
};
