import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, MessageCircle, Phone, Trash2 } from "lucide-react";

// "פניות" (K46): people who left details on the /welcome page. The table `leads` is closed to the public
// (the page writes through the Netlify function lead-submit), so only an admin can read or change it here.

type LeadStatus = "new" | "contacted" | "not_relevant";

interface LeadRow {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  note: string;
  consent_at: string;
  source: string;
  status: LeadStatus;
  handled_note: string;
}

const STATUS_LABEL: Record<LeadStatus, string> = { new: "חדש", contacted: "נוצר קשר", not_relevant: "לא רלוונטי" };
const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  contacted: "bg-emerald-100 text-emerald-800",
  not_relevant: "bg-muted text-muted-foreground",
};
type View = "all" | LeadStatus;

const LIMIT = 500;
const fmt = (iso: string) => new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
// 0501234567 -> 972501234567 for the WhatsApp link
const waNumber = (phone: string) => "972" + phone.replace(/^0/, "");

export const LeadsManager = ({ onNewCount }: { onNewCount?: (n: number) => void }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<View>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("leads")
      .select("id,created_at,name,phone,email,note,consent_at,source,status,handled_note")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) toast({ title: "הפניות לא נטענו", description: error.message, variant: "destructive" });
    const list: LeadRow[] = data ?? [];
    setRows(list);
    setNotes(Object.fromEntries(list.map((r) => [r.id, r.handled_note ?? ""])));
    onNewCount?.(list.filter((r) => r.status === "new").length);
    setIsLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, contacted: 0, not_relevant: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  const shown = view === "all" ? rows : rows.filter((r) => r.status === view);

  const patch = async (id: string, change: Partial<Pick<LeadRow, "status" | "handled_note">>) => {
    setBusy(id);
    const { error } = await (supabase as any).from("leads").update(change).eq("id", id);
    setBusy(null);
    if (error) return toast({ title: "השינוי לא נשמר", description: error.message, variant: "destructive" });
    const next = rows.map((r) => (r.id === id ? { ...r, ...change } : r));
    setRows(next);
    onNewCount?.(next.filter((r) => r.status === "new").length);
  };

  const remove = async (r: LeadRow) => {
    if (!(await confirm({ title: `למחוק את הפנייה של ${r.name}?`, text: "הפרטים יימחקו לגמרי. אי אפשר לבטל.", danger: true }))) return;
    setBusy(r.id);
    const { error } = await (supabase as any).from("leads").delete().eq("id", r.id);
    setBusy(null);
    if (error) return toast({ title: "המחיקה נכשלה", description: error.message, variant: "destructive" });
    const next = rows.filter((x) => x.id !== r.id);
    setRows(next);
    onNewCount?.(next.filter((x) => x.status === "new").length);
  };

  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const chips: { id: View; label: string; n: number }[] = [
    { id: "all", label: "הכול", n: counts.all },
    { id: "new", label: STATUS_LABEL.new, n: counts.new },
    { id: "contacted", label: STATUS_LABEL.contacted, n: counts.contacted },
    { id: "not_relevant", label: STATUS_LABEL.not_relevant, n: counts.not_relevant },
  ];

  return (
    <div data-area="K46">
      <p className="text-muted-foreground mb-4">
        אנשים שהשאירו פרטים בדף /welcome. כולם סימנו שהם מאשרים שניצור איתם קשר (תאריך האישור מופיע בכל שורה).
        {rows.length >= LIMIT && ` מוצגות ${LIMIT} הפניות האחרונות.`}
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setView(c.id)}
            aria-pressed={view === c.id}
            className={`rounded-full px-4 py-1.5 text-sm border transition-smooth ${view === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-secondary"}`}
          >
            {c.label} ({c.n})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">{rows.length === 0 ? "עדיין לא הגיעו פניות." : "אין פניות בסטטוס הזה."}</Card>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground">{r.name}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {fmt(r.created_at)} · אישור יצירת קשר: {fmt(r.consent_at)}{r.source ? ` · מקור: ${r.source}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2" dir="ltr">
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={`tel:${r.phone}`}><Phone size={14} />{r.phone}</a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="gap-1.5" aria-label={`וואטסאפ ל${r.name}`}>
                    <a href={`https://wa.me/${waNumber(r.phone)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={`mailto:${r.email}`}><Mail size={14} />{r.email}</a>
                  </Button>
                </div>
              </div>

              {r.note && <p className="mt-3 rounded-lg bg-secondary/50 p-3 text-sm text-foreground whitespace-pre-wrap">{r.note}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select value={r.status} onValueChange={(v) => patch(r.id, { status: v as LeadStatus })} disabled={busy === r.id}>
                  <SelectTrigger className="w-40" aria-label="סטטוס"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1 min-w-[200px]"
                  placeholder="הערה פנימית (נשמרת ביציאה מהשדה)"
                  maxLength={500}
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  onBlur={() => { if ((notes[r.id] ?? "") !== (r.handled_note ?? "")) patch(r.id, { handled_note: notes[r.id] ?? "" }); }}
                />
                <Button size="icon" variant="ghost" onClick={() => remove(r)} disabled={busy === r.id} aria-label={`מחיקת הפנייה של ${r.name}`}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
