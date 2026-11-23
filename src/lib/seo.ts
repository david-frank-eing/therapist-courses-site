// The texts of Google results and link previews (table site_seo, three pages). Edited in Admin -> "גוגל ותצוגת קישור".
// A Netlify edge function (seo-meta) writes them into the page; an empty field means "leave the page as it is".
// These are the texts David approved on 23-24/11/2026; the admin screen starts from them.

export type SeoPage = "default" | "welcome" | "assistant";

export interface SeoRow {
  page: SeoPage;
  title: string;
  description: string;
  og_title: string;
  og_description: string;
}

export const SEO_PAGES: { page: SeoPage; label: string; path: string; note: string }[] = [
  { page: "default", label: "הדף הראשי וכל שאר הדפים", path: "/", note: "הכותרת והתיאור שגוגל מציג, והתצוגה כשמשתפים את האתר בוואטסאפ" },
  { page: "welcome", label: "דף הנחיתה", path: "/welcome", note: "הקישור שאתה שולח לאנשים" },
  { page: "assistant", label: "העוזר העסקי", path: "/assistant", note: "כשמשתפים את הקישור לעוזר" },
];

export const SEO_DEFAULTS: Record<SeoPage, SeoRow> = {
  default: {
    page: "default",
    title: "הכול בידיים | הצד העסקי של הקליניקה, למטפלים עצמאיים",
    description: "הצד העסקי של הקליניקה, בעברית ובשפה פשוטה. ידע, כלים וליווי למטפלים עצמאיים שרוצים שיותר אנשים יכירו אותם, ועוזר עסקי חינמי.",
    og_title: "יש לכם מה לתת. הגיע הזמן שאנשים ידעו שאתם קיימים.",
    og_description: "סדנה פרונטלית למטפלים עצמאיים · 29.12.26 · 79 ₪ בהרשמה מוקדמת. מבית הכול בידיים.",
  },
  welcome: {
    page: "welcome",
    title: "הכול בידיים | סיימתם ללמוד? הצד העסקי של הקליניקה",
    description: "שיווק, פרסום, יומן וכסף לקליניקה: מה שלא לימדו אתכם בלימודים. השאירו פרטים או נסו את העוזר העסקי החינמי.",
    og_title: "סיימתם ללמוד. ועכשיו? מסתדרים לבד.",
    og_description: "הצד העסקי של הקליניקה, בעברית ובשפה פשוטה. נסו את העוזר העסקי החינמי.",
  },
  assistant: {
    page: "assistant",
    title: "העוזר העסקי לקליניקה | הכול בידיים",
    description: "כמה שאלות קצרות, וקבלו ערוץ אחד להתחיל ממנו, שלוש פעולות לשבוע ונוסח לפנייה הראשונה. בחינם.",
    og_title: "איפה למצוא את הלקוחות הראשונים שלי?",
    og_description: "העוזר העסקי של הכול בידיים: כמה שאלות, ותוכנית קצרה להשגת לקוחות. בחינם.",
  },
};

export const SEO_LIMITS = { title: 120, description: 300, og_title: 120, og_description: 300 } as const;
// what Google usually shows before cutting the text (a guide, not a rule)
export const GOOGLE_TITLE_SHOWN = 60;
export const GOOGLE_DESCRIPTION_SHOWN = 160;
