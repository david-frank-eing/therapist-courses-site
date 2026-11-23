import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, CheckCircle2, Clock, Loader2, MapPin, Tag, Users } from "lucide-react";
import { OPEN_WORKSHOP_EVENT, safeUrl, useWorkshop, workshopFacts, workshopNote } from "@/lib/workshop";

// The workshop pop-up (K57): a button that stays on the page ("הסדנה הקרובה") and opens a window with the workshop details
// and a short form to receive information. The details go through the same function as the /welcome form
// (lead-submit, source "workshop"): they land in Admin -> "פניות" and as a Telegram message, with the workshop's name
// in the note. Nothing opens by itself: the visitor decides.

const ICONS = { kind: Users, date: CalendarDays, duration: Clock, price: Tag, location: MapPin } as const;

export const WorkshopPopup = () => {
  const { workshop } = useWorkshop();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onOpen = () => { setOpen(true); setError(""); };
    window.addEventListener(OPEN_WORKSHOP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_WORKSHOP_EVENT, onOpen);
  }, []);

  if (!workshop) return null;
  const url = safeUrl(workshop.register_url);

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
        body: JSON.stringify({ name, phone, email, note: workshopNote(workshop), consent, website, source: "workshop" }),
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
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-area="K57"
          className="fixed bottom-4 right-4 z-50 rounded-full bg-brand-orange text-white font-bold shadow-card-hover px-5 py-3 text-sm md:text-base hover:opacity-90 transition-opacity"
          aria-label={`${workshop.badge || "הסדנה הקרובה"}: מידע והרשמה`}
        >
          {workshop.badge || "הסדנה הקרובה"} · לפרטים
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto text-right" dir="rtl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-2xl font-extrabold">{workshop.title}</DialogTitle>
            <DialogDescription className="sr-only">פרטי הסדנה הקרובה וטופס לקבלת מידע</DialogDescription>
          </DialogHeader>

          <ul className="flex flex-wrap gap-2">
            {workshopFacts(workshop).map(({ key, text }) => {
              const Icon = ICONS[key];
              return (
                <li key={key} className="inline-flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1.5 text-sm font-medium text-secondary-foreground">
                  <Icon size={15} className="text-brand-orange" /> {text}
                </li>
              );
            })}
          </ul>
          {workshop.description && <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{workshop.description}</p>}

          {url && (
            <Button size="lg" variant="cta" asChild className="w-full">
              <a href={url} target="_blank" rel="noopener noreferrer">{workshop.button_text || "להרשמה"}</a>
            </Button>
          )}

          {done ? (
            <div className="rounded-xl bg-secondary p-5 text-center space-y-2" role="status">
              <CheckCircle2 className="mx-auto text-brand-orange" size={36} />
              <p className="font-bold text-foreground">תודה, הפרטים התקבלו</p>
              <p className="text-sm text-muted-foreground">נחזור אליכם עם כל המידע על הסדנה.</p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-3 border-t border-border pt-4">
              <p className="font-bold text-foreground">{url ? "רוצים קודם לקבל מידע?" : "לקבלת מידע על הסדנה"}</p>
              <div className="space-y-1">
                <Label htmlFor="ws-name">שם מלא</Label>
                <Input id="ws-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ws-phone">טלפון</Label>
                  <Input id="ws-phone" type="tel" dir="ltr" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ws-email">מייל</Label>
                  <Input id="ws-email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              {/* honeypot: a field people never see or fill */}
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="ws-website">אל תמלאו שדה זה</label>
                <input id="ws-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="ws-consent" checked={consent} onCheckedChange={(v) => { setConsent(v === true); setError(""); }} className="mt-1" />
                <Label htmlFor="ws-consent" className="leading-relaxed cursor-pointer">
                  אני מאשר/ת ליצור איתי קשר בטלפון ובמייל ולשלוח לי מידע.
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                אפשר לבטל את ההסכמה בכל עת. הפרטים נשמרים ומעובדים לפי <Link to="/privacy" className="underline" onClick={() => setOpen(false)}>מדיניות הפרטיות</Link>.
              </p>
              {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
              <Button type="submit" variant="cta" size="lg" className="w-full" disabled={sending}>
                {sending ? <Loader2 className="animate-spin" size={20} /> : "שלחו לי מידע"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
