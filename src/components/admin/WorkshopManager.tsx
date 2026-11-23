import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { WORKSHOP_DEFAULTS, WORKSHOP_FIELDS, withDefaults, type Workshop } from "@/lib/workshop";
import { WorkshopCard } from "@/components/WorkshopSection";

// "סדנה" (K56): the owner replaces these details before every new workshop, and can change the wording of the
// "about me" block and of the floating button and its pop-up. The home page, the pop-up and the information form all
// read the same row (table site_workshop), so nothing else needs to change and no Supabase visit is needed.
// The registration link may stay empty (then the button opens the information pop-up) or be a plain https:// address.

const LIMITS: Partial<Record<keyof Workshop, number>> = {
  badge: 40, title: 120, kind: 60, date_text: 60, duration_text: 60, price_text: 80, location_text: 120, description: 800, button_text: 40, register_url: 500,
  about_title: 40, about_text: 800, about_quote: 300, about_button: 40,
  popup_button: 60, popup_form_title: 80, popup_submit: 40, popup_thanks_title: 80, popup_thanks_text: 300,
};

type Field = { key: keyof Workshop; label: string; hint?: string; multiline?: boolean };

const SECTIONS: { title: string; note?: string; fields: Field[] }[] = [
  {
    title: "הסדנה",
    fields: [
      { key: "badge", label: "התג מעל הכותרת", hint: "למשל: הסדנה הקרובה" },
      { key: "title", label: "שם הסדנה" },
      { key: "kind", label: "סוג", hint: "למשל: סדנה פרונטלית" },
      { key: "date_text", label: "תאריך", hint: "למשל: 29.12.26" },
      { key: "duration_text", label: "משך", hint: "למשל: 4.5 שעות כולל הפסקה" },
      { key: "price_text", label: "מחיר", hint: "למשל: 79 ₪ בהרשמה מוקדמת" },
      { key: "location_text", label: "מקום (אופציונלי)", hint: "אפשר להשאיר ריק" },
      { key: "description", label: "תיאור", multiline: true },
      { key: "button_text", label: "הטקסט על הכפתור", hint: "למשל: אני רוצה להירשם" },
      { key: "register_url", label: "קישור להרשמה ותשלום (אופציונלי)", hint: "https://... דף תשלום או וואטסאפ (wa.me). אם ריק, הכפתור פותח חלון לקבלת מידע" },
    ],
  },
  {
    title: "מי אני",
    note: "הבלוק שמתחת לסדנה בדף הראשי. אם תמחק שדה ותשמור, יחזור הטקסט המקורי.",
    fields: [
      { key: "about_title", label: "כותרת" },
      { key: "about_text", label: "הטקסט", multiline: true },
      { key: "about_quote", label: "המשפט המודגש" },
      { key: "about_button", label: "הטקסט על הכפתור" },
    ],
  },
  {
    title: "הכפתור הצף והחלון",
    note: "הכפתור הכתום שמלווה את הגולש בדף, והחלון שנפתח ממנו.",
    fields: [
      { key: "popup_button", label: "הטקסט על הכפתור הצף" },
      { key: "popup_form_title", label: "כותרת הטופס בחלון" },
      { key: "popup_submit", label: "הטקסט על כפתור השליחה" },
      { key: "popup_thanks_title", label: "כותרת ההודעה אחרי שליחה" },
      { key: "popup_thanks_text", label: "הטקסט אחרי שליחה", multiline: true },
    ],
  },
];

export const WorkshopManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Workshop>(WORKSHOP_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    (supabase as any).from("site_workshop").select("*").eq("id", 1).maybeSingle().then(({ data, error }: any) => {
      if (error) setTableMissing(true);
      // a saved workshop: show it (empty "about me" and pop-up fields show their default text)
      else if (data && data.title) setForm(withDefaults(data));
      // an empty row (first time): start from the approved text, switched off until the owner saves it on
      else setForm({ ...WORKSHOP_DEFAULTS, enabled: false });
      setLoading(false);
    });
  }, []);

  const set = <K extends keyof Workshop>(k: K, v: Workshop[K]) => setForm((f) => ({ ...f, [k]: v }));

  // earlier workshops and wordings (table site_workshop_history, filled by a database trigger on every save)
  const [versions, setVersions] = useState<{ id: number; created_at: string; snapshot: Partial<Workshop> }[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    if (!showHistory || versions !== null) return;
    (supabase as any).from("site_workshop_history").select("id,created_at,snapshot").order("id", { ascending: false }).limit(20)
      .then(({ data, error }: any) => {
        if (error) { toast({ title: "ההיסטוריה לא נטענה", description: error.message, variant: "destructive" }); setVersions([]); return; }
        setVersions(data ?? []);
      });
  }, [showHistory, versions]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const url = form.register_url.trim();
    if (url && !/^https:\/\/[^\s]+$/.test(url)) return toast({ title: "הקישור חייב להתחיל ב-https://", variant: "destructive" });
    if (form.enabled && !form.title.trim()) return toast({ title: "כדי להציג את הסדנה צריך שם", variant: "destructive" });
    setSaving(true);
    const payload = Object.fromEntries(WORKSHOP_FIELDS.map((k) => [k, k === "enabled" ? form.enabled : String(form[k]).trim()]));
    const { error } = await (supabase as any).from("site_workshop").upsert({ id: 1, ...payload, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
    queryClient.invalidateQueries({ queryKey: ["site_workshop"] });
    setVersions(null); // the save added a version: reload the history next time it is opened
    toast({ title: form.enabled ? "נשמר. השינוי מופיע באתר" : "נשמר. הסדנה מוסתרת מהאתר" });
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6" data-area="K56">
      {tableMissing && (
        <Card className="p-4 border-destructive/50 text-sm text-right">
          הטבלה של הסדנה עוד לא קיימת במסד. צריך להריץ פעם אחת ב-Supabase את הקובץ <b>20261124000000_site_workshop.sql</b>. עד אז אי אפשר לשמור.
        </Card>
      )}
      <Card className="p-5 space-y-6">
        <p className="text-sm text-muted-foreground text-right">
          כאן מחליפים את פרטי הסדנה לפני כל סדנה, ואפשר לשנות גם את הנוסח של שאר הטקסטים. השינוי מופיע מיד בדף הראשי, בכפתור הצף ובחלון המידע.
        </p>
        {SECTIONS.map((section, si) => (
          <div key={section.title} className="space-y-4">
            <h3 className="font-bold text-lg text-right border-b border-border pb-1">{section.title}</h3>
            {section.note && <p className="text-xs text-muted-foreground text-right">{section.note}</p>}
            {si === 0 && (
              <label className="flex items-center gap-3 text-right">
                <input type="checkbox" className="h-5 w-5" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
                <span className="font-medium">להציג את הסדנה באתר</span>
              </label>
            )}
            {section.fields.map(({ key, label, hint, multiline }) => {
              const value = String(form[key]);
              const max = LIMITS[key] ?? 200;
              return (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`ws-${key}`}>{label}</Label>
                  {multiline
                    ? <Textarea id={`ws-${key}`} rows={4} maxLength={max} value={value} onChange={(e) => set(key, e.target.value as never)} />
                    : <Input id={`ws-${key}`} maxLength={max} value={value} dir={key === "register_url" ? "ltr" : "rtl"} onChange={(e) => set(key, e.target.value as never)} />}
                  <p className="text-xs text-muted-foreground">{hint ? `${hint} · ` : ""}{value.length} מתוך {max}</p>
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="cta" onClick={save} disabled={saving || tableMissing}>{saving ? "שומר..." : "שמור"}</Button>
          <Button type="button" variant="outline" onClick={() => setForm({ ...WORKSHOP_DEFAULTS, enabled: form.enabled })}>טען את הטקסטים המקוריים</Button>
        </div>
      </Card>

      <div className="space-y-2">
        <p className="font-bold text-right">כך הסדנה נראית באתר</p>
        <WorkshopCard w={form} preview />
      </div>

      <Card className="p-5 space-y-3">
        <button type="button" className="w-full flex items-center justify-between text-right" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
          <span className="font-bold text-foreground">היסטוריית סדנאות ונוסחים</span>
          <span className="text-sm text-muted-foreground">{showHistory ? "הסתר" : "הצג"}</span>
        </button>
        {showHistory && (versions === null ? <Loader2 className="h-5 w-5 animate-spin" /> : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">עוד אין גרסאות שמורות. כל שמירה מעכשיו תירשם כאן, כולל סדנאות קודמות.</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v, i) => (
              <li key={v.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                <div className="text-right min-w-0">
                  <p className="text-sm font-medium text-foreground">{new Date(v.created_at).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })}{i === 0 && " · הגרסה הנוכחית"}</p>
                  <p className="text-xs text-muted-foreground truncate">{[v.snapshot.title, v.snapshot.date_text, v.snapshot.price_text].filter(Boolean).join(" · ") || "(בלי פרטי סדנה)"}{v.snapshot.enabled === false && " · הוסתרה"}</p>
                </div>
                {i > 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => { setForm(withDefaults({ ...v.snapshot })); toast({ title: "הגרסה נטענה לעורך. לחצו שמור כדי להחזיר אותה" }); }}>
                    טען לעורך
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}
      </Card>
    </div>
  );
};
