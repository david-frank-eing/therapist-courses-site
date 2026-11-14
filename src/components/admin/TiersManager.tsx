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

// "מה יש בכל דרגה": the courses part is editable here (each course has a minimum tier).
// The feature rows are fixed in the code today and shown for reading only.
const FEATURES: { name: string; from: SubscriptionTier | "admin" | "switch" }[] = [
  { name: "לוח מודעות: צפייה ופרסום", from: "free" },
  { name: "קורסים לפי הדרגה שנקבעה לכל קורס (למטה)", from: "free" },
  { name: "ניהול מטופלים", from: "premium" },
  { name: "דשבורד תזכורות ומשימות", from: "premium" },
  { name: "זימון תורים (דף ציבורי משלך)", from: "premium" },
  { name: "כספים", from: "switch" },
];
const TIERS: SubscriptionTier[] = ["free", "basic", "premium", "vip"];
const rank = (t: SubscriptionTier) => TIERS.indexOf(t);

interface CourseRow { id: string; title: string; min_tier: SubscriptionTier; is_published: boolean }

export const TiersManager = () => {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
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
        <h2 className="text-lg font-bold mb-1">מה כל דרגה פותחת</h2>
        <p className="text-sm text-muted-foreground mb-3">
          הרשימה הזו קבועה בקוד כרגע, ולכן היא לקריאה בלבד. כדי לשנות אותה צריך שינוי בקוד. הקורסים, לעומת זאת, נקבעים כאן למטה.
        </p>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-right">יכולת</th>
                {TIERS.map((t) => <th key={t} className="p-3 text-center">{TIER_LABELS[t]}</th>)}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.name} className="border-b last:border-0">
                  <td className="p-3">{f.name}</td>
                  {TIERS.map((t) => (
                    <td key={t} className="p-3 text-center">
                      {f.from === "switch" ? "מתג אישי" : f.from === "admin" ? "—" : rank(t) >= rank(f.from) ? "✓" : "✗"}
                    </td>
                  ))}
                </tr>
              ))}
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
