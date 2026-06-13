import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type SiteSettingsRow = Database["public"]["Tables"]["site_settings"]["Row"];

// Editable site content. Keys match the DB columns. DB values override these
// defaults when non-empty, so the site looks identical until an admin edits it.
export type SiteContentKey =
  | "contact_email"
  | "contact_phone"
  | "contact_address"
  | "social_facebook"
  | "social_instagram"
  | "social_linkedin"
  | "social_youtube"
  | "about_title"
  | "about_text"
  | "hero_badge"
  | "hero_title"
  | "hero_subtitle";

export const SITE_DEFAULTS: Record<SiteContentKey, string> = {
  contact_email: "info@therapist-space.co.il",
  contact_phone: "03-1234567",
  contact_address: "תל אביב, ישראל",
  social_facebook: "",
  social_instagram: "",
  social_linkedin: "",
  social_youtube: "",
  about_title: "אודות מרחב למטפלים",
  about_text:
    "מרחב למטפלים הוא בית מקצועי למטפלים שרוצים להרחיב את העסק והקליניקה שלהם. אנו מציעים קורסים, סרטונים ומשאבים בתחומי ניהול העסק, כלי AI ושיווק הקליניקה — וכן לוח מודעות קהילתי. המטרה: לתת לכם כלים מעשיים לצמיחה מקצועית ולמילוי הקליניקה במטופלים חדשים.",
  hero_badge: "🎓 פלטפורמת הקורסים למטפלים",
  hero_title: "הרחיבו את העסק והקליניקה שלכם",
  hero_subtitle:
    "למדו כיצד לנהל עסק מצליח, להשתמש בכלי AI מתקדמים, ולמלא את הקליניקה שלכם במטופלים חדשים",
};

export const useSiteSettings = () => {
  const { data } = useQuery({
    queryKey: ["site_settings"],
    queryFn: async (): Promise<SiteSettingsRow | null> => {
      const { data } = await supabase
        .from("site_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      return data ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const settings = { ...SITE_DEFAULTS };
  if (data) {
    (Object.keys(SITE_DEFAULTS) as SiteContentKey[]).forEach((key) => {
      const value = data[key];
      if (value != null && value !== "") settings[key] = value;
    });
  }

  return settings;
};
