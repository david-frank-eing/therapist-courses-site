import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarCheck, CheckCircle2, Loader2, Mail, Megaphone, Phone, PiggyBank, Wrench } from "lucide-react";

// "/welcome" (M37): the page David sends people to before they enter the site.
// The content of the site is BUSINESS, not therapy: marketing, advertising, filling the clinic, order in the
// calendar and the money. The page never calls itself a therapy course or a professional training (David's wish).
// The form posts to the Netlify function lead-submit (the table `leads` has no public policy).

const PAINS = [
  "הלימודים נגמרו, ואף אחד לא לימד איך להביא מטופלים ואיך לפרסם את הקליניקה.",
  "היומן, הכסף והקבלות מתפזרים בין הודעות, מחברות ואקסלים, ואין סדר.",
  "אין מי שמכוון בצד העסקי, וכל החלטה על שיווק או מחיר נעשית לבד ובניחושים.",
];

const PRODUCTS = [
  {
    icon: Megaphone,
    title: "מרחב למטפלים",
    text: "מידע עסקי בעברית: שיווק ופרסום, מילוי הקליניקה, כלי AI לעסק, קורסים ולוח מודעות.",
  },
  {
    icon: CalendarCheck,
    title: "קרלוס תזכורות",
    text: "יומן ותזכורות במקום אחד, מעקב אחרי הרגלים, ודף שאפשר לשלוח ללקוחות כדי שיקבעו פגישה בעצמם.",
  },
  {
    icon: PiggyBank,
    title: "קרלוס כספים",
    text: "הוצאות וקבלות מסודרות, ובסוף כל תקופה חבילה מוכנה לרואה החשבון, בלי לרדוף אחרי ניירות.",
  },
];

const STEPS = [
  "משאירים כאן שם, טלפון ומייל.",
  "דוד חוזר אליכם ומסביר מה מתאים לכם.",
  "מתחילים לעבוד בסדר, צעד אחרי צעד.",
];

const Welcome = () => {
  const [params] = useSearchParams();
  const site = useSiteSettings();
  const formRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot: a hidden field that real people leave empty
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setError("");
    if (name.trim().length < 2) return setError("נא לכתוב שם מלא");
    if (phone.replace(/\D/g, "").length < 9) return setError("נא לכתוב מספר טלפון תקין");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("נא לכתוב כתובת מייל תקינה");
    if (!consent) return setError("כדי להמשיך צריך לסמן שאתם מאשרים שניצור איתכם קשר");
    setSending(true);
    try {
      const res = await fetch("/.netlify/functions/lead-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, note, consent, website, source: params.get("src") ?? "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "משהו השתבש, נסו שוב בעוד רגע");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש, נסו שוב בעוד רגע");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* a small top bar: the site menu leads to pages that are closed to guests while the site is in maintenance mode */}
      <header className="border-t-4 border-brand-orange bg-card border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <img src="/logo.png" alt="הכול בידיים - מרכז מידע למטפלים במגע" className="h-12 w-auto" />
          <Button asChild variant="ghost" size="sm"><Link to="/auth">כניסה לחשבון</Link></Button>
        </div>
      </header>
      <main>
        {/* opening */}
        <section className="relative py-16 md:py-24 overflow-hidden" data-area="K44">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-16 right-10 w-32 h-32 md:w-64 md:h-64 bg-brand-orange/10 rounded-full blur-3xl" />
            <div className="absolute bottom-10 left-10 w-48 h-48 md:w-96 md:h-96 bg-accent/30 rounded-full blur-3xl" />
          </div>
          <div className="container relative max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 bg-secondary rounded-full px-4 py-2 mb-6">
              <span className="text-secondary-foreground font-medium">למטפלים ולמטפלות במגע</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-foreground mb-6 leading-tight">
              סיימתם ללמוד. ועכשיו? מסתדרים לבד.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              בלימודים לימדו אתכם לטפל. אף אחד לא לימד איך להביא מטופלים, איך לפרסם, ואיך לנהל את הכסף והיומן.
              כאן מרוכז הצד העסקי של הקליניקה, בעברית ובשפה פשוטה.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" variant="cta" onClick={scrollToForm}>
                השאירו פרטים ואחזור אליכם
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/assistant">נסו את העוזר העסקי בחינם</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth?mode=signup&redirect=/assistant">הרשמה חינם</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* the pain */}
        <section className="py-12 md:py-16 bg-secondary/40">
          <div className="container max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6 text-center">מכירים את זה?</h2>
            <ul className="space-y-4">
              {PAINS.map((p) => (
                <li key={p} className="flex items-start gap-3 bg-card rounded-xl p-4 shadow-card">
                  <Wrench className="mt-1 shrink-0 text-brand-orange" size={20} />
                  <span className="text-foreground">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* what is inside */}
        <section className="py-12 md:py-20">
          <div className="container max-w-5xl">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-center">מה יש בפנים</h2>
            <p className="text-muted-foreground text-center mb-10">שלושה כלים שעובדים ביחד, וכולם עוזרים לניהול העסק.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PRODUCTS.map(({ icon: Icon, title, text }) => (
                <div key={title} className="bg-card rounded-2xl p-6 shadow-card">
                  <span className="inline-flex w-12 h-12 rounded-full bg-brand-orange/15 items-center justify-center mb-4">
                    <Icon className="text-brand-orange" size={24} />
                  </span>
                  <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
                  <p className="text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* how it works */}
        <section className="py-12 md:py-16 bg-secondary/40">
          <div className="container max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center">איך זה עובד</h2>
            <ol className="space-y-4">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-4 bg-card rounded-xl p-4 shadow-card">
                  <span className="w-10 h-10 shrink-0 rounded-full bg-brand-orange text-foreground font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-foreground">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* the form */}
        <section className="py-12 md:py-20" id="leave-details" ref={formRef} data-area="K45">
          <div className="container max-w-xl">
            <div className="bg-card rounded-2xl p-6 md:p-8 shadow-card-hover border-t-4 border-brand-orange">
              {done ? (
                <div className="text-center py-6" role="status">
                  <CheckCircle2 className="mx-auto mb-4 text-emerald-600" size={48} />
                  <h2 className="text-2xl font-bold text-foreground mb-2">תודה, קיבלתי</h2>
                  <p className="text-muted-foreground">אחזור אליכם בקרוב בטלפון או במייל.</p>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <h2 className="text-2xl font-bold text-foreground mb-2">השאירו פרטים</h2>
                  <p className="text-muted-foreground mb-6">אחזור אליכם ואשלח מידע על מה שמתאים לכם.</p>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="lead-name">שם מלא</Label>
                      <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
                    </div>
                    <div>
                      <Label htmlFor="lead-phone">טלפון</Label>
                      <Input id="lead-phone" type="tel" inputMode="tel" dir="ltr" className="text-right" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={20} required />
                    </div>
                    <div>
                      <Label htmlFor="lead-email">מייל</Label>
                      <Input id="lead-email" type="email" inputMode="email" dir="ltr" className="text-right" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={120} required />
                    </div>
                    <div>
                      <Label htmlFor="lead-note">מה הכי קשה לכם בצד העסקי עכשיו? (לא חובה)</Label>
                      <Textarea id="lead-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
                    </div>

                    {/* honeypot: hidden from people and from screen readers */}
                    <div aria-hidden="true" className="sr-only">
                      <label htmlFor="lead-website">אל תמלאו את השדה הזה</label>
                      <input id="lead-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox id="lead-consent" checked={consent} onCheckedChange={(v) => { setConsent(v === true); setError(""); }} className="mt-1" />
                      <Label htmlFor="lead-consent" className="leading-relaxed cursor-pointer">
                        אני מאשר/ת ליצור איתי קשר בטלפון ובמייל ולשלוח לי מידע.
                      </Label>
                    </div>

                    {error && <p className="text-destructive text-sm" role="alert">{error}</p>}

                    <Button type="submit" variant="cta" size="lg" className="w-full" disabled={sending}>
                      {sending ? <Loader2 className="animate-spin" size={20} /> : "שליחה"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-6">
              כבר יש לכם חשבון? <Link to="/auth" className="text-primary underline underline-offset-4">כניסה</Link>
            </p>
          </div>
        </section>
      </main>
      <footer className="bg-foreground text-primary-foreground py-8 border-t-4 border-brand-orange">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <span>הכול בידיים · מרכז מידע למטפלים במגע</span>
          <div className="flex flex-wrap items-center justify-center gap-5">
            {site.contact_email && <a href={`mailto:${site.contact_email}`} className="inline-flex items-center gap-2 hover:text-brand-orange"><Mail size={16} />{site.contact_email}</a>}
            {site.contact_phone && <a href={`tel:${site.contact_phone}`} className="inline-flex items-center gap-2 hover:text-brand-orange" dir="ltr"><Phone size={16} />{site.contact_phone}</a>}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Welcome;
