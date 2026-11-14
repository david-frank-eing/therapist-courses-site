import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  FEATURES,
  TIERS,
  featuresSplit,
  isAllowed,
  loadTierData,
  setTierData,
  useTierData,
  tierName,
  type AccessRow,
  type Feature,
  type Tier,
  type TierPlan,
} from "@/lib/tiers";
import { PlanCard, toolsOf } from "@/components/PricingPreview";

// "דרגות" (K9): the one place where the admin decides what each tier has.
// 1. what each tier opens (tier_access, enforced in the database too)
// 2. the plan texts shown on the pricing page (tier_plans), with a live preview
// 3. the minimum tier of each course (courses.min_tier)

interface CourseRow { id: string; title: string; min_tier: Tier; is_published: boolean }

const TIER_ORDER: Tier[] = TIERS;
const opensCourse = (tier: Tier, min: Tier) => TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min);

export const TiersManager = () => {
  const { toast } = useToast();
  const { plans, access, plansReady, accessReady } = useTierData();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [savingCourse, setSavingCourse] = useState<string | null>(null);

  useEffect(() => {
    loadTierData(true);
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("id,title,min_tier,is_published")
        .order("order_index", { ascending: true });
      setCourses((data as CourseRow[]) ?? []);
      setLoadingCourses(false);
    })();
  }, []);

  const split = featuresSplit(access);
  // before the "יכולות נפרדות" SQL runs, the database knows only the one combined row
  const rows: { id: string; label: string; note: string }[] = split
    ? FEATURES
    : [{ id: "paid_tools", label: "כלי עבודה", note: "ניהול מטופלים, תזכורות ומשימות, זימון תורים ותוכן, יחד" }];

  const allowed = (feature: string, tier: Tier) =>
    feature === "paid_tools"
      ? access.find((r) => r.feature === "paid_tools" && r.tier === tier)?.allowed ?? ["premium", "vip"].includes(tier)
      : isAllowed(access, feature as Feature, tier);

  const toggle = async (feature: string, tier: Tier) => {
    const next = !allowed(feature, tier);
    const key = feature + tier;
    setSavingCell(key);
    const { error } = await (supabase as any)
      .from("tier_access")
      .upsert({ feature, tier, allowed: next }, { onConflict: "feature,tier" });
    setSavingCell(null);
    if (error) return toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
    const rest = access.filter((r) => !(r.feature === feature && r.tier === tier));
    setTierData({ access: [...rest, { feature, tier, allowed: next } as AccessRow] });
    const label = rows.find((r) => r.id === feature)?.label ?? feature;
    toast({ title: `${label}: ${next ? "נפתח" : "נסגר"} לתכנית ${tierName(plans, tier)}` });
  };

  const setCourseTier = async (c: CourseRow, tier: Tier) => {
    setSavingCourse(c.id);
    const { error } = await supabase.from("courses").update({ min_tier: tier }).eq("id", c.id);
    setSavingCourse(null);
    if (error) return toast({ title: "עדכון נכשל", description: error.message, variant: "destructive" });
    setCourses((prev) => prev.map((x) => (x.id === c.id ? { ...x, min_tier: tier } : x)));
    toast({ title: "התכנית המינימלית של הקורס עודכנה" });
  };

  return (
    <div className="space-y-10 text-right">
      {/* 1. what each tier opens */}
      <section>
        <h2 className="text-lg font-bold mb-1">מה כל תכנית פותחת</h2>
        <p className="text-sm text-muted-foreground mb-3">
          סימון נשמר מיד, חל על כל המשתמשים בתכנית ונאכף גם במסד הנתונים. אפשר לשנות בכל רגע. הורדת יכולת לא מוחקת
          נתונים: המשתמש ממשיך לראות ולמחוק את מה שיצר, אבל לא יוכל להוסיף ולערוך. מנהל תמיד מורשה להכול.
        </p>
        {accessReady === false && (
          <Card className="p-3 mb-3 text-sm border-amber-500/40 bg-amber-500/5">
            טבלת ההרשאות עוד לא קיימת במסד. צריך להריץ ב-Supabase את קובץ ה-SQL "טבלת הרשאות". עד אז פרימיום ו-VIP מקבלים את כלי העבודה, והסימונים לא נשמרים.
          </Card>
        )}
        {accessReady && !split && (
          <Card className="p-3 mb-3 text-sm border-amber-500/40 bg-amber-500/5">
            כרגע כל כלי העבודה נפתחים יחד. כדי לסמן כל יכולת בנפרד, צריך להריץ ב-Supabase את קובץ ה-SQL "יכולות נפרדות". ההרצה לא משנה כלום למשתמשים.
          </Card>
        )}
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[34rem]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="p-3 text-right font-semibold">יכולת</th>
                {TIERS.map((t) => <th key={t} className="p-3 text-center font-semibold">{tierName(plans, t)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3">
                    <b>{r.label}</b>
                    <div className="text-xs text-muted-foreground">{r.note}</div>
                  </td>
                  {TIERS.map((t) => (
                    <td key={t} className="p-3 text-center">
                      {savingCell === r.id + t ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
                      ) : (
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-[hsl(var(--primary))] cursor-pointer disabled:cursor-not-allowed"
                          checked={allowed(r.id, t)}
                          disabled={accessReady !== true}
                          onChange={() => toggle(r.id, t)}
                          aria-label={`${r.label} לתכנית ${tierName(plans, t)}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b">
                <td className="p-3">
                  <b>קורסים</b>
                  <div className="text-xs text-muted-foreground">לפי התכנית המינימלית של כל קורס, בטבלה למטה</div>
                </td>
                {TIERS.map((t) => {
                  const open = courses.filter((c) => c.is_published && opensCourse(t, c.min_tier));
                  return (
                    <td key={t} className="p-3 text-center text-xs text-muted-foreground align-top">
                      {loadingCourses ? "…" : open.length === 0 ? "אין" : (
                        // a few names, the rest folded: with dozens of courses the row would fill the screen
                        <div title={open.map((c) => c.title).join("\n")}>
                          {open.slice(0, 3).map((c) => <div key={c.id} className="truncate max-w-[10rem] mx-auto">{c.title}</div>)}
                          {open.length > 3 && <div className="font-semibold text-foreground/70">ועוד {open.length - 3}</div>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-b">
                <td className="p-3">לוח מודעות<div className="text-xs text-muted-foreground">צפייה לכולם, פרסום לכל מחובר</div></td>
                {TIERS.map((t) => <td key={t} className="p-3 text-center">✓</td>)}
              </tr>
              <tr>
                <td className="p-3">כספים<div className="text-xs text-muted-foreground">מתג אישי לכל משתמש, בלשונית "משתמשים"</div></td>
                <td colSpan={4} className="p-3 text-center text-muted-foreground">מתג אישי</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </section>

      {/* 2. the plan texts */}
      <section data-area="K42">
        <h2 className="text-lg font-bold mb-1">איך התכניות מופיעות בדף המחירים</h2>
        <p className="text-sm text-muted-foreground mb-3">
          שם, מחיר, משפט קצר והטבות נוספות. היכולות שסימנת למעלה נכתבות בכרטיס אוטומטית (מודגשות), ואחריהן ההטבות שכתבת כאן.
          ההטבות הן טקסט בלבד ולא נאכפות באתר.
        </p>
        {plansReady === false && (
          <Card className="p-3 mb-3 text-sm border-amber-500/40 bg-amber-500/5">
            טבלת התכניות עוד לא קיימת במסד. צריך להריץ ב-Supabase את קובץ ה-SQL "תכניות ומחירים". עד אז דף המחירים מציג את הטקסטים הקבועים, ואי אפשר לשמור.
          </Card>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          {plans.map((p) => (
            <PlanEditor key={p.tier} plan={p} tools={toolsOf(access, p.tier)} canSave={plansReady === true} />
          ))}
        </div>
      </section>

      {/* 3. courses */}
      <section>
        <h2 className="text-lg font-bold mb-1">התכנית המינימלית לכל קורס</h2>
        <p className="text-sm text-muted-foreground mb-3">משתמש מהתכנית שנבחרה ומעלה רואה את הקורס. אפשר לשנות כאן או בעורך הקורס.</p>
        {loadingCourses ? (
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
                  {savingCourse === c.id && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  <Select value={c.min_tier} onValueChange={(v) => setCourseTier(c, v as Tier)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIERS.map((t) => <SelectItem key={t} value={t}>{tierName(plans, t)}</SelectItem>)}
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

const PlanEditor = ({ plan, tools, canSave }: { plan: TierPlan; tools: string[]; canSave: boolean }) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState<TierPlan>(plan);
  const [perksText, setPerksText] = useState(plan.perks.join("\n"));
  const [saving, setSaving] = useState(false);

  // a fresh load from the server replaces the form, unless there are unsaved edits
  const planKey = JSON.stringify(plan);
  useEffect(() => { setDraft(plan); setPerksText(plan.perks.join("\n")); }, [planKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview: TierPlan = useMemo(
    () => ({ ...draft, perks: perksText.split("\n").map((s) => s.trim()).filter(Boolean) }),
    [draft, perksText]
  );
  const dirty = JSON.stringify(preview) !== JSON.stringify(plan);

  const save = async () => {
    if (!preview.name.trim()) return toast({ title: "צריך שם לתכנית", variant: "destructive" });
    setSaving(true);
    const { error } = await (supabase as any).from("tier_plans").upsert(
      { tier: preview.tier, name: preview.name.trim(), price: preview.price, tagline: preview.tagline.trim(),
        perks: preview.perks, highlighted: preview.highlighted },
      { onConflict: "tier" }
    );
    setSaving(false);
    if (error) return toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
    const data = await loadTierData(true);
    setTierData({ plans: data.plans });
    toast({ title: `התכנית "${preview.name}" נשמרה` });
  };

  return (
    <Card className="p-4 grid gap-4 sm:grid-cols-[1fr_15rem]">
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <div>
            <Label htmlFor={`name-${plan.tier}`}>שם התכנית</Label>
            <Input id={`name-${plan.tier}`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor={`price-${plan.tier}`}>מחיר לחודש</Label>
            <Input
              id={`price-${plan.tier}`}
              type="number"
              min={0}
              dir="ltr"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
          </div>
        </div>
        <div>
          <Label htmlFor={`tag-${plan.tier}`}>משפט קצר</Label>
          <Input id={`tag-${plan.tier}`} value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`perks-${plan.tier}`}>הטבות נוספות (שורה לכל הטבה)</Label>
          <Textarea id={`perks-${plan.tier}`} rows={5} value={perksText} onChange={(e) => setPerksText(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.highlighted} onCheckedChange={(v) => setDraft({ ...draft, highlighted: v })} />
          להבליט בדף המחירים (הכי פופולרי)
        </label>
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={!canSave || !dirty || saving} className="gap-1">
            {saving && <Loader2 size={16} className="animate-spin" />}
            שמירה
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => { setDraft(plan); setPerksText(plan.perks.join("\n")); }}>ביטול שינויים</Button>
          )}
          {dirty && <span className="text-xs text-amber-600">יש שינויים שלא נשמרו</span>}
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">תצוגה מקדימה</p>
        <PlanCard plan={preview} tools={tools} />
      </div>
    </Card>
  );
};
