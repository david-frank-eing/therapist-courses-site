import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import {
  GOOGLE_DESCRIPTION_SHOWN, GOOGLE_TITLE_SHOWN, SEO_DEFAULTS, SEO_LIMITS, SEO_PAGES, type SeoPage, type SeoRow,
} from "@/lib/seo";

// "גוגל ותצוגת קישור" (K58): the title and description Google shows, and the title and description of the preview when a
// link is shared (WhatsApp, Facebook). Three pages. Saved in the table site_seo; the edge function seo-meta writes them
// into the page. No Supabase visit is needed. Google updates its results by itself, usually within days; WhatsApp keeps
// an old preview for a while per link.

type Rows = Record<SeoPage, SeoRow>;
const KEYS = ["title", "description", "og_title", "og_description"] as const;
const LABELS: Record<(typeof KEYS)[number], string> = {
  title: "הכותרת בגוגל",
  description: "התיאור בגוגל",
  og_title: "כותרת התצוגה בוואטסאפ ובפייסבוק",
  og_description: "תיאור התצוגה בוואטסאפ ובפייסבוק",
};

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export const SeoManager = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Rows>(SEO_DEFAULTS);
  const [page, setPage] = useState<SeoPage>("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    (supabase as any).from("site_seo").select("*").then(({ data, error }: any) => {
      if (error) setTableMissing(true);
      else {
        const next: Rows = { ...SEO_DEFAULTS };
        for (const r of (data ?? []) as SeoRow[]) {
          // an empty row (first time) starts from the approved text
          if (r.title || r.description || r.og_title || r.og_description) next[r.page] = r;
        }
        setRows(next);
      }
      setLoading(false);
    });
  }, []);

  const row = rows[page];
  const set = (k: (typeof KEYS)[number], v: string) => setRows((r) => ({ ...r, [page]: { ...r[page], [k]: v } }));

  // earlier versions of this page's texts (table site_seo_history, filled by a database trigger on every change)
  const [versions, setVersions] = useState<{ id: number; created_at: string; snapshot: SeoRow }[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => { setVersions(null); }, [page]);
  useEffect(() => {
    if (!showHistory || versions !== null) return;
    (supabase as any).from("site_seo_history").select("id,created_at,snapshot").eq("page", page).order("id", { ascending: false }).limit(20)
      .then(({ data, error }: any) => {
        if (error) { toast({ title: "ההיסטוריה לא נטענה", description: error.message, variant: "destructive" }); setVersions([]); return; }
        setVersions(data ?? []);
      });
  }, [showHistory, versions, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    const payload = SEO_PAGES.map(({ page: p }) => ({ page: p, ...Object.fromEntries(KEYS.map((k) => [k, rows[p][k].trim()])), updated_at: new Date().toISOString() }));
    const { error } = await (supabase as any).from("site_seo").upsert(payload);
    setSaving(false);
    if (error) return toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
    setVersions(null); // the save added a version: reload the history next time it is opened
    toast({ title: "נשמר. התצוגה בגוגל ובוואטסאפ תתעדכן בדקות הקרובות" });
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const meta = SEO_PAGES.find((p) => p.page === page)!;
  return (
    <div className="space-y-6" data-area="K58">
      {tableMissing && (
        <Card className="p-4 border-destructive/50 text-sm text-right">
          הטבלה עוד לא קיימת במסד. צריך להריץ פעם אחת ב-Supabase את הקובץ <b>20261124000000_site_workshop.sql</b>. עד אז אי אפשר לשמור.
        </Card>
      )}
      <Card className="p-5 space-y-5">
        <p className="text-sm text-muted-foreground text-right">
          כאן משנים את מה שמופיע בתוצאות החיפוש בגוגל, ובתצוגה כששולחים קישור בוואטסאפ או בפייסבוק. גוגל מעדכן לבד, בדרך כלל תוך כמה ימים. בוואטסאפ ייתכן שקישור ששלחת בעבר ימשיך להציג את הישן.
        </p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="בחירת דף">
          {SEO_PAGES.map((p) => (
            <Button key={p.page} type="button" size="sm" variant={page === p.page ? "default" : "outline"} onClick={() => setPage(p.page)}>{p.label}</Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-right">{meta.note}</p>

        {KEYS.map((k) => {
          const multiline = k === "description" || k === "og_description";
          const max = SEO_LIMITS[k];
          return (
            <div key={k} className="space-y-1">
              <Label htmlFor={`seo-${k}`}>{LABELS[k]}</Label>
              {multiline
                ? <Textarea id={`seo-${k}`} rows={3} maxLength={max} value={row[k]} onChange={(e) => set(k, e.target.value)} />
                : <Input id={`seo-${k}`} maxLength={max} value={row[k]} onChange={(e) => set(k, e.target.value)} />}
              <p className="text-xs text-muted-foreground">
                {row[k].length} מתוך {max}
                {k === "title" && ` · גוגל מציג בדרך כלל עד ${GOOGLE_TITLE_SHOWN} תווים`}
                {k === "description" && ` · גוגל מציג בדרך כלל עד ${GOOGLE_DESCRIPTION_SHOWN} תווים`}
                {" · שדה ריק משאיר את הדף כמו שהוא"}
              </p>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="cta" onClick={save} disabled={saving || tableMissing}>{saving ? "שומר..." : "שמור"}</Button>
          <Button type="button" variant="outline" onClick={() => setRows((r) => ({ ...r, [page]: SEO_DEFAULTS[page] }))}>טען את הטקסט המקורי של הדף</Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-1 text-right" dir="rtl">
          <p className="text-xs font-bold text-muted-foreground mb-2">כך זה ייראה בגוגל (בקירוב)</p>
          <p className="text-xs text-emerald-700" dir="ltr">stupendous-lily-f8cd84.netlify.app{meta.path === "/" ? "" : meta.path}</p>
          <p className="text-lg text-blue-700 leading-snug">{cut(row.title, GOOGLE_TITLE_SHOWN) || "(הכותרת הקיימת בדף)"}</p>
          <p className="text-sm text-muted-foreground">{cut(row.description, GOOGLE_DESCRIPTION_SHOWN) || "(התיאור הקיים בדף)"}</p>
        </Card>
        <Card className="p-0 overflow-hidden text-right" dir="rtl">
          <p className="text-xs font-bold text-muted-foreground p-4 pb-2">כך זה ייראה בוואטסאפ (בקירוב)</p>
          <img src="/og-image.png" alt="" className="w-full" />
          <div className="p-4 bg-muted/50 space-y-1">
            <p className="text-xs text-muted-foreground" dir="ltr">stupendous-lily-f8cd84.netlify.app</p>
            <p className="font-bold text-foreground leading-snug">{row.og_title || "(הכותרת הקיימת בדף)"}</p>
            <p className="text-sm text-muted-foreground">{cut(row.og_description, 120) || "(התיאור הקיים בדף)"}</p>
          </div>
        </Card>
      </div>
      <Card className="p-5 space-y-3">
        <button type="button" className="w-full flex items-center justify-between text-right" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
          <span className="font-bold text-foreground">היסטוריית גרסאות: {meta.label}</span>
          <span className="text-sm text-muted-foreground">{showHistory ? "הסתר" : "הצג"}</span>
        </button>
        {showHistory && (versions === null ? <Loader2 className="h-5 w-5 animate-spin" /> : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">עוד אין גרסאות שמורות לדף הזה. כל שמירה מעכשיו תירשם כאן.</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v, i) => (
              <li key={v.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                <div className="text-right min-w-0">
                  <p className="text-sm font-medium text-foreground">{new Date(v.created_at).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })}{i === 0 && " · הגרסה הנוכחית"}</p>
                  <p className="text-xs text-muted-foreground truncate">{v.snapshot.title}</p>
                </div>
                {i > 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => { setRows((r) => ({ ...r, [page]: { ...r[page], title: v.snapshot.title, description: v.snapshot.description, og_title: v.snapshot.og_title, og_description: v.snapshot.og_description } })); toast({ title: "הגרסה נטענה לעורך. לחצו שמור כדי להחזיר אותה" }); }}>
                    טען לעורך
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}
      </Card>
      <p className="text-xs text-muted-foreground text-right">התמונה בתצוגת הקישור קבועה כרגע (מכילה את התאריך 29.12.26). בסדנה הבאה היא צריכה החלפה.</p>
    </div>
  );
};
