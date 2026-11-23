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
import { WORKSHOP_DEFAULTS, WORKSHOP_FIELDS, type Workshop } from "@/lib/workshop";
import { WorkshopCard } from "@/components/WorkshopSection";

// "סדנה" (K56): the owner replaces these details before every new workshop. The home page, the pop-up and the
// information form all read the same row (table site_workshop), so nothing else needs to change.
// The registration link may stay empty (then the button opens the information pop-up) or be a plain https:// address.

const LIMITS: Partial<Record<keyof Workshop, number>> = {
  badge: 40, title: 120, kind: 60, date_text: 60, duration_text: 60, price_text: 80, location_text: 120, description: 800, button_text: 40, register_url: 500,
};

const TEXT_FIELDS: { key: keyof Workshop; label: string; hint?: string; multiline?: boolean }[] = [
  { key: "badge", label: "התג מעל הכותרת", hint: "למשל: הסדנה הקרובה" },
  { key: "title", label: "שם הסדנה" },
  { key: "kind", label: "סוג", hint: "למשל: סדנה פרונטלית" },
  { key: "date_text", label: "תאריך", hint: "למשל: 29.12.26" },
  { key: "duration_text", label: "משך", hint: "למשל: 4.5 שעות כולל הפסקה" },
  { key: "price_text", label: "מחיר", hint: "למשל: 79 ₪ בהרשמה מוקדמת" },
  { key: "location_text", label: "מקום (אופציונלי)", hint: "למשל: אל סירקולו, בר אילן. אפשר להשאיר ריק" },
  { key: "description", label: "תיאור", multiline: true },
  { key: "button_text", label: "הטקסט על הכפתור", hint: "למשל: אני רוצה להירשם" },
  { key: "register_url", label: "קישור להרשמה ותשלום (אופציונלי)", hint: "https://... דף תשלום או וואטסאפ (wa.me). אם ריק, הכפתור פותח חלון לקבלת מידע" },
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
      // an empty row (first time): start from the approved text, switched off until the owner saves it on
      else if (data && data.title) setForm(Object.fromEntries(WORKSHOP_FIELDS.map((k) => [k, data[k] ?? (k === "enabled" ? false : "")])) as unknown as Workshop);
      else setForm({ ...WORKSHOP_DEFAULTS, enabled: false });
      setLoading(false);
    });
  }, []);

  const set = <K extends keyof Workshop>(k: K, v: Workshop[K]) => setForm((f) => ({ ...f, [k]: v }));

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
    toast({ title: form.enabled ? "הסדנה עודכנה ומוצגת באתר" : "הסדנה נשמרה ומוסתרת מהאתר" });
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6" data-area="K56">
      {tableMissing && (
        <Card className="p-4 border-destructive/50 text-sm text-right">
          הטבלה של הסדנה עוד לא קיימת במסד. צריך להריץ ב-Supabase את קובץ ה-SQL <b>20261124000000_site_workshop.sql</b>. עד אז אי אפשר לשמור.
        </Card>
      )}
      <Card className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground text-right">
          כאן מחליפים את פרטי הסדנה לפני כל סדנה. השינוי מופיע מיד בדף הראשי, בכפתור הצף ובחלון המידע.
        </p>
        <label className="flex items-center gap-3 text-right">
          <input type="checkbox" className="h-5 w-5" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          <span className="font-medium">להציג את הסדנה באתר</span>
        </label>
        {TEXT_FIELDS.map(({ key, label, hint, multiline }) => {
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
        <div className="flex gap-2">
          <Button type="button" variant="cta" onClick={save} disabled={saving || tableMissing}>{saving ? "שומר..." : "שמור"}</Button>
          <Button type="button" variant="outline" onClick={() => setForm({ ...WORKSHOP_DEFAULTS, enabled: form.enabled })}>טען את הטקסט המקורי</Button>
        </div>
      </Card>

      <div className="space-y-2">
        <p className="font-bold text-right">כך זה נראה באתר</p>
        <WorkshopCard w={form} preview />
      </div>
    </div>
  );
};
