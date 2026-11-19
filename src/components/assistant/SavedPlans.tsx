import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { deletePlan, listPlans, updatePlan, type PlanResult, type SavedPlan } from "@/lib/assistant";
import { PlanView } from "./PlanView";

// "התוכניות שלי" (K49): the plans the signed-in therapist saved. Own rows only (RLS). Each can be edited and deleted.

const fmt = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { dateStyle: "medium" });

const Field = ({ label, value, onChange, rows = 2, max }: { label: string; value: string; onChange: (v: string) => void; rows?: number; max: number }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} maxLength={max} />
  </div>
);

export const SavedPlans = ({ refreshKey = 0 }: { refreshKey?: number }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setPlans(await listPlans()); }
    catch (e) { setPlans([]); toast({ title: "התוכניות לא נטענו", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); }
  };
  useEffect(() => { void load(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (p: SavedPlan) => {
    setEditId(p.id);
    setDraft({ business_summary: p.business_summary, channel: p.channel, why: p.why, actions: [...p.actions], outreach_message: p.outreach_message, next_step: p.next_step });
  };

  const saveEdit = async () => {
    if (!editId || !draft) return;
    if (!draft.channel.trim() || draft.actions.some((a) => !a.trim())) return toast({ title: "הערוץ ושלוש הפעולות חייבים להיות מלאים", variant: "destructive" });
    setBusy(true);
    try {
      const row = await updatePlan(editId, { ...draft, actions: draft.actions.map((a) => a.trim()) });
      setPlans((list) => (list ?? []).map((p) => (p.id === row.id ? row : p)));
      setEditId(null);
      setDraft(null);
      toast({ title: "השינויים נשמרו" });
    } catch (e) {
      toast({ title: "השינוי לא נשמר", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const remove = async (p: SavedPlan) => {
    if (!(await confirm({ title: "למחוק את התוכנית?", text: "התוכנית תימחק מהחשבון. אי אפשר לבטל.", danger: true }))) return;
    try {
      await deletePlan(p.id);
      setPlans((list) => (list ?? []).filter((x) => x.id !== p.id));
      toast({ title: "התוכנית נמחקה" });
    } catch (e) {
      toast({ title: "המחיקה נכשלה", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  if (plans === null) return <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline ml-2" />טוען...</div>;
  if (plans.length === 0) return <p className="py-10 text-center text-muted-foreground" data-area="K49">עוד לא שמרתם תוכנית. אחרי שיחה עם העוזר לוחצים על &quot;שמור את התוכנית שלי&quot;.</p>;

  return (
    <div className="space-y-4" data-area="K49">
      {plans.map((p) => (
        <Card key={p.id} className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">נשמרה ב-{fmt(p.created_at)}{p.updated_at !== p.created_at && ` · עודכנה ב-${fmt(p.updated_at)}`}</p>
            {editId !== p.id && (
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(p)}><Pencil className="h-4 w-4 ml-1" /> עריכה</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void remove(p)}><Trash2 className="h-4 w-4 ml-1" /> מחיקה</Button>
              </div>
            )}
          </div>
          {editId === p.id && draft ? (
            <div className="space-y-3 text-right">
              <Field label="איפה אתם עומדים" value={draft.business_summary} onChange={(v) => setDraft({ ...draft, business_summary: v })} rows={3} max={1200} />
              <div className="space-y-1">
                <Label>הערוץ להתחיל ממנו</Label>
                <Input value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })} maxLength={200} />
              </div>
              <Field label="למה הערוץ הזה" value={draft.why} onChange={(v) => setDraft({ ...draft, why: v })} max={800} />
              {draft.actions.map((a, i) => (
                <Field key={i} label={`פעולה ${i + 1}`} value={a} onChange={(v) => setDraft({ ...draft, actions: draft.actions.map((x, j) => (j === i ? v : x)) })} max={300} />
              ))}
              <Field label="נוסח לפנייה הראשונה" value={draft.outreach_message} onChange={(v) => setDraft({ ...draft, outreach_message: v })} rows={5} max={1500} />
              <Field label="הצעד הבא" value={draft.next_step} onChange={(v) => setDraft({ ...draft, next_step: v })} max={400} />
              <div className="flex gap-2">
                <Button type="button" variant="cta" onClick={saveEdit} disabled={busy}>{busy ? "שומר..." : "שמור שינויים"}</Button>
                <Button type="button" variant="outline" onClick={() => { setEditId(null); setDraft(null); }}>ביטול</Button>
              </div>
            </div>
          ) : (
            <PlanView plan={p} />
          )}
        </Card>
      ))}
    </div>
  );
};
