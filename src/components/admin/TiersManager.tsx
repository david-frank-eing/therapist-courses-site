import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SubscriptionTier } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { TIER_OPTIONS, TIER_LABELS } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

// "מה יש בכל דרגה": טבלת ההרשאות. השורה הראשונה נשמרת בטבלה tier_access ונאכפת במסד הנתונים
// (has_paid_tier). שאר השורות מוצגות לקריאה: קורסים נקבעים לכל קורס (למטה), כספים במתג אישי.
const TIERS: SubscriptionTier[] = ["free", "basic", "premium", "vip"];
const DEFAULT_TOOLS: Record<SubscriptionTier, boolean> = { free: false, basic: false, premium: true, vip: true };

interface CourseRow { id: string; title: string; min_tier: SubscriptionTier; is_published: boolean }

export const TiersManager = () => {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();
  const [tools, setTools] = useState<Record<SubscriptionTier, boolean>>(DEFAULT_TOOLS);
  const [toolsReady, setToolsReady] = useState<boolean | null>(null); // null = loading, false = migration missing
  const [savingTier, setSavingTier] = useState<string | null>(null);

  const toggleTool = async (tier: SubscriptionTier) => {
    const next = !tools[tier];
    setSavingTier(tier);
    const { error } = await (supabase as any)
      .from("tier_access")
      .upsert({ feature: "paid_tools", tier, allowed: next }, { onConflict: "feature,tier" });
    setSavingTier(null);
    if (error) return toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
    setTools((t) => ({ ...t, [tier]: next }));
    toast({ title: next ? `כלי העבודה נפתחו לדרגת ${TIER_LABELS[tier]}` : `כלי העבודה נסגרו לדרגת ${TIER_LABELS[tier]}` });
  };

  useEffect(() => {
    (async () => {
      const { data: rows, error } = await (supabase as any)
        .from("tier_access").select("tier,allowed").eq("feature", "paid_tools");
      if (error) setToolsReady(false);
      else {
        setToolsReady(true);
        const m = { ...DEFAULT_TOOLS };
        (rows ?? []).forEach((r: { tier: SubscriptionTier; allowed: boolean }) => { m[r.tier] = r.allowed; });
        setTools(m);
      }
    })();
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("id,title,min_tier,is_published")
        .order("order_index", { ascending: true });
      setCourses((data as CourseRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const setTier = async (c: CourseRow, tier: SubscriptionTier) => {
    setSavingId(c.id);
    const { error } = await supabase.from("courses").update({ min_tier: tier }).eq("id", c.id);
    setSavingId(null);
    if (error) return toast({ title: "עדכון נכשל", description: error.message, variant: "destructive" });
    setCourses((prev) => prev.map((x) => (x.id === c.id ? { ...x, min_tier: tier } : x)));
    toast({ title: "הדרגה של הקורס עודכנה" });
  };

  return (
    <div className="space-y-8 text-right">
      <section>
        <h2 className="text-lg font-bold mb-1">טבלת הרשאות: מה כל דרגה פותחת</h2>
        <p className="text-sm text-muted-foreground mb-3">
          סימון בשורה הראשונה נשמר מיד ונאכף גם במסד הנתונים. הורדת הרשאה לא מוחקת נתונים: המשתמש ממשיך לראות ולמחוק את מה שיצר, אבל לא יוכל להוסיף ולערוך. מנהל תמיד מורשה.
        </p>
        {toolsReady === false && (
          <Card className="p-3 mb-3 text-sm border-amber-500/40 bg-amber-500/5">
            טבלת ההרשאות עוד לא קיימת במסד. צריך להריץ ב-Supabase את קובץ ה-SQL "טבלת הרשאות". עד אז הכלל הקבוע (פרימיום ו-VIP) פועל והסימונים לא נשמרים.
          </Card>
        )}
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-right">יכולת</th>
                {TIERS.map((t) => <th key={t} className="p-3 text-center">{TIER_LABELS[t]}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-3">
                  <b>כלי עבודה</b>
                  <div className="text-xs text-muted-foreground">ניהול מטופלים, תזכורות ומשימות, זימון תורים</div>
                </td>
                {TIERS.map((t) => (
                  <td key={t} className="p-3 text-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[hsl(var(--primary))] cursor-pointer disabled:cursor-not-allowed"
                      checked={tools[t]}
                      disabled={toolsReady !== true || savingTier === t}
                      onChange={() => toggleTool(t)}
                      aria-label={`כלי עבודה לדרגת ${TIER_LABELS[t]}`}
                    />
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-3">קורסים<div className="text-xs text-muted-foreground">נקבע לכל קורס בנפרד, בטבלה למטה</div></td>
                <td colSpan={4} className="p-3 text-center text-muted-foreground">לפי הדרגה המינימלית של כל קורס</td>
              </tr>
              <tr className="border-b">
                <td className="p-3">לוח מודעות<div className="text-xs text-muted-foreground">צפייה לכולם, פרסום לכל מחובר</div></td>
                {TIERS.map((t) => <td key={t} className="p-3 text-center">✓</td>)}
              </tr>
              <tr>
                <td className="p-3">כספים<div className="text-xs text-muted-foreground">מתג אישי לכל משתמש, לא לפי דרגה</div></td>
                <td colSpan={4} className="p-3 text-center text-muted-foreground">מתג אישי</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-1">הדרגה המינימלית לכל קורס</h2>
        <p className="text-sm text-muted-foreground mb-3">משתמש מהדרגה שנבחרה ומעלה רואה את הקורס. אפשר לשנות כאן או בעורך הקורס.</p>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : courses.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">אין קורסים עדיין.</Card>
        ) : (
          <div className="space-y-2">
            {courses.map((c) => (
              <Card key={c.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.title}</p>
                  {!c.is_published && <p className="text-xs text-muted-foreground">טיוטה</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingId === c.id && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  <Select value={c.min_tier} onValueChange={(v) => setTier(c, v as SubscriptionTier)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
