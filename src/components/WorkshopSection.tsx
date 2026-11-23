import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, MapPin, Tag, Users } from "lucide-react";
import { openWorkshop, safeUrl, useWorkshop, workshopFacts, type Workshop } from "@/lib/workshop";

// "הסדנה הקרובה" (K54) and "מי אני" (K55) on the home page. The workshop text comes from the table site_workshop
// (edited in Admin -> "סדנה" before every workshop). "מי אני" is a fixed text.
// The big button opens the registration link when there is one (a payment page or WhatsApp), and otherwise opens
// the pop-up where a therapist leaves details to receive information (see WorkshopPopup).

const ABOUT = {
  title: "מי אני",
  text: "אני דוד פרנק, מטפל רפואי וספורטיבי כבר כ־25 שנה, מרצה ומדריך מטפלים. הקמתי את \"הכול בידיים\" כדי לתת למטפלים את מה שלא מלמדים בלימודי הטיפול: איך לבנות קליניקה שאנשים מכירים ובוחרים בה.",
  quote: "אם יש לכם יכולת לעזור לאנשים, מגיע להם לפחות לדעת שאתם קיימים.",
  button: "לפרטים ולהרשמה לסדנה",
};

const ICONS = { kind: Users, date: CalendarDays, duration: Clock, price: Tag, location: MapPin } as const;

// a button that goes to the registration link when there is one, otherwise opens the information pop-up
export const WorkshopAction = ({ w, label, className }: { w: Workshop; label: string; className?: string }) => {
  const url = safeUrl(w.register_url);
  return url ? (
    <Button size="lg" variant="cta" asChild className={className}>
      <a href={url} target="_blank" rel="noopener noreferrer">{label}</a>
    </Button>
  ) : (
    <Button size="lg" variant="cta" type="button" className={className} onClick={openWorkshop}>{label}</Button>
  );
};

// the card itself, also used by the admin screen as a live preview
export const WorkshopCard = ({ w, preview = false }: { w: Workshop; preview?: boolean }) => (
  <div className="rounded-3xl bg-card shadow-card-hover border border-brand-orange/30 overflow-hidden">
    <div className="h-2 bg-brand-orange" />
    <div className="p-8 md:p-12 text-center md:text-right">
      {w.badge && (
        <span className="inline-block bg-brand-orange text-white font-bold rounded-full px-5 py-1.5 text-sm md:text-base mb-5">{w.badge}</span>
      )}
      <h2 className="text-3xl md:text-5xl font-extrabold text-foreground mb-6 leading-tight">{w.title}</h2>
      <ul className="flex flex-wrap justify-center md:justify-start gap-3 mb-6">
        {workshopFacts(w).map(({ key, text }) => {
          const Icon = ICONS[key];
          return (
            <li key={key} className="inline-flex items-center gap-2 bg-secondary rounded-full px-4 py-2 font-medium text-secondary-foreground">
              <Icon size={18} className="text-brand-orange" /> {text}
            </li>
          );
        })}
      </ul>
      {w.description && <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto md:mx-0 mb-8 whitespace-pre-line">{w.description}</p>}
      {w.button_text && (preview
        ? <Button size="lg" variant="cta" type="button">{w.button_text}</Button>
        : <WorkshopAction w={w} label={w.button_text} />)}
      {!preview && safeUrl(w.register_url) && (
        <p className="mt-4">
          <button type="button" onClick={openWorkshop} className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            רוצים קודם לקבל מידע? השאירו פרטים
          </button>
        </p>
      )}
    </div>
  </div>
);

export const WorkshopSection = () => {
  const { workshop } = useWorkshop();
  if (!workshop) return null;
  return (
    <section id="workshop" className="py-12 md:py-20" data-area="K54">
      <div className="container max-w-5xl">
        <WorkshopCard w={workshop} />
      </div>
    </section>
  );
};

export const AboutDavidSection = () => {
  const { workshop } = useWorkshop();
  return (
    <section id="about-david" className="py-12 md:py-20 bg-secondary/40" data-area="K55">
      <div className="container max-w-3xl text-center md:text-right">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">{ABOUT.title}</h2>
        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8">{ABOUT.text}</p>
        <blockquote className="border-brand-orange md:border-r-4 md:pr-5 text-xl md:text-2xl font-bold text-foreground leading-snug mb-8">
          {ABOUT.quote}
        </blockquote>
        {workshop && <WorkshopAction w={workshop} label={ABOUT.button} />}
      </div>
    </section>
  );
};
