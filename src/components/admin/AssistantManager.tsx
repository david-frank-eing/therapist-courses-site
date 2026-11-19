import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import type { StoredMessage } from "@/lib/assistant";

// "העוזר" (K51, K52): where the owner "trains" the business assistant and sees what people asked.
//  K51: guidelines, a bank of preferred questions, and examples of good answers. They go into the assistant's
//       instructions on every conversation (they cannot widen what it may talk about). Limit 8000 characters in
//       total, which keeps the bill small (the database enforces it too).
//  K52: the questions that were asked, WITHOUT who asked (the function admin_assistant_questions does not return user_id).

const TOTAL_MAX = 8000;
type Part = "guide" | "asked";

interface Cfg { guidelines: string; question_bank: string; examples: string }
interface Asked { id: string; created_at: string; track: string; status: string; turns: number; off_topic_count: number; is_registered: boolean; messages: StoredMessage[] }
type Who = "all" | "registered" | "guest";

const fmt = (iso: string) => new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
const PAGE = 50;

export const AssistantManager = () => {
  const { toast } = useToast();
  const [part, setPart] = useState<Part>("guide");
  const [saved, setSaved] = useState<Cfg | null>(null);
  const [cfg, setCfg] = useState<Cfg>({ guidelines: "", question_bank: "", examples: "" });
  const [saving, setSaving] = useState(false);
  const [asked, setAsked] = useState<Asked[] | null>(null);
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyOff, setOnlyOff] = useState(false);
  const [who, setWho] = useState<Who>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    (supabase as any).from("assistant_config").select("guidelines,question_bank,examples").eq("id", 1).maybeSingle().then(({ data, error }: any) => {
      if (error) toast({ title: "ההנחיות לא נטענו", description: error.message, variant: "destructive" });
      const c: Cfg = { guidelines: data?.guidelines ?? "", question_bank: data?.question_bank ?? "", examples: data?.examples ?? "" };
      setSaved(c);
      setCfg(c);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAsked = async (offset: number) => {
    const { data, error } = await (supabase as any).rpc("admin_assistant_questions", { p_limit: PAGE, p_offset: offset });
    if (error) return toast({ title: "השאלות לא נטענו", description: error.message, variant: "destructive" });
    const rows: Asked[] = (data ?? []).filter((r: Asked) => Array.isArray(r.messages) && r.messages.length > 0);
    setAsked((old) => (offset === 0 ? rows : [...(old ?? []), ...rows]));
    setMore((data ?? []).length === PAGE);
  };
  useEffect(() => { if (part === "asked" && asked === null) void loadAsked(0); }, [part]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = cfg.guidelines.length + cfg.question_bank.length + cfg.examples.length;
  const dirty = !!saved && (saved.guidelines !== cfg.guidelines || saved.question_bank !== cfg.question_bank || saved.examples !== cfg.examples);

  const save = async () => {
    if (total > TOTAL_MAX) return toast({ title: `יש יותר מדי טקסט (${total} מתוך ${TOTAL_MAX})`, variant: "destructive" });
    setSaving(true);
    const { error } = await (supabase as any).from("assistant_config").update({ ...cfg, updated_at: new Date().toISOString() }).eq("id", 1);
    setSaving(false);
    if (error) return toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
    setSaved(cfg);
    toast({ title: "ההנחיות נשמרו. הן נכנסות לשיחות הבאות" });
  };

  const addExample = (q: string) => {
    const line = `שאלה נפוצה: ${q.slice(0, 200)}`;
    setCfg((c) => ({ ...c, examples: c.examples ? `${c.examples}\n${line}` : line }));
    setPart("guide");
    toast({ title: "נוסף לדוגמאות. אפשר לערוך ולשמור" });
  };

  const shown = useMemo(() => {
    const s = search.trim();
    return (asked ?? []).filter((r) =>
      (!onlyOff || r.off_topic_count > 0)
      && (who === "all" || (who === "registered") === r.is_registered)
      && (!s || r.messages.some((m) => m.text.includes(s))));
  }, [asked, search, onlyOff, who]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant={part === "guide" ? "default" : "outline"} size="sm" onClick={() => setPart("guide")}>הנחיות ודוגמאות</Button>
        <Button type="button" variant={part === "asked" ? "default" : "outline"} size="sm" onClick={() => setPart("asked")}>שאלות שנשאלו</Button>
      </div>

      {part === "guide" && (
        <Card className="p-5 space-y-4" data-area="K51">
          {!saved ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <>
              <p className="text-sm text-muted-foreground">
                מה שכתוב כאן נכנס להנחיות של העוזר בכל שיחה. אי אפשר להרחיב בו את התחום: העוזר נשאר בצד העסקי של הקליניקה ודוחה שאלות קליניות ושאלות לא קשורות.
              </p>
              <div className="space-y-1">
                <Label>הנחיות (טון, מה להדגיש, מה להימנע ממנו)</Label>
                <Textarea value={cfg.guidelines} onChange={(e) => setCfg({ ...cfg, guidelines: e.target.value })} rows={6} />
              </div>
              <div className="space-y-1">
                <Label>בנק שאלות מועדפות (שורה לכל שאלה; העוזר בוחר מתוכן לפי מה שכבר נאמר)</Label>
                <Textarea value={cfg.question_bank} onChange={(e) => setCfg({ ...cfg, question_bank: e.target.value })} rows={6} />
              </div>
              <div className="space-y-1">
                <Label>דוגמאות לתשובות או לשיחות טובות</Label>
                <Textarea value={cfg.examples} onChange={(e) => setCfg({ ...cfg, examples: e.target.value })} rows={6} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm ${total > TOTAL_MAX ? "text-destructive" : "text-muted-foreground"}`}>{total} מתוך {TOTAL_MAX} תווים</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => saved && setCfg(saved)}>בטל שינויים</Button>
                  <Button type="button" variant="cta" disabled={!dirty || saving || total > TOTAL_MAX} onClick={save}>{saving ? "שומר..." : "שמור"}</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {part === "asked" && (
        <Card className="p-5 space-y-4" data-area="K52">
          <p className="text-sm text-muted-foreground">השאלות שנשאלו, בלי לדעת מי שאל. אפשר להוסיף שאלה נפוצה לדוגמאות כדי שהעוזר ילמד ממנה.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Input className="max-w-xs" placeholder="חיפוש בטקסט" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={who} onChange={(e) => setWho(e.target.value as Who)} aria-label="סינון לפי רשום או אורח">
              <option value="all">כולם</option>
              <option value="registered">רק רשומים</option>
              <option value="guest">רק אורחים</option>
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyOff} onChange={(e) => setOnlyOff(e.target.checked)} /> רק שיחות עם שאלות מחוץ לנושא</label>
          </div>
          {asked === null ? <Loader2 className="h-5 w-5 animate-spin" /> : shown.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center">אין שאלות להצגה.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((r) => {
                const first = r.messages.find((m) => m.role === "user")?.text ?? "";
                const open = openId === r.id;
                return (
                  <li key={r.id} className="rounded-lg border border-border p-3">
                    <button type="button" className="w-full text-right" onClick={() => setOpenId(open ? null : r.id)}>
                      <p className="font-medium text-foreground">{first}</p>
                      <p className="text-xs text-muted-foreground"><span className={`rounded px-1.5 py-0.5 ml-1 ${r.is_registered ? "bg-emerald-100 text-emerald-800" : "bg-muted"}`}>{r.is_registered ? "רשום" : "אורח"}</span>{fmt(r.created_at)} · {r.turns} תשובות{r.off_topic_count > 0 && ` · ${r.off_topic_count} מחוץ לנושא`}{r.status === "locked" && " · ננעלה"}</p>
                    </button>
                    {open && (
                      <div className="mt-3 space-y-2">
                        {r.messages.map((m, i) => (
                          <p key={i} className={`rounded-md px-3 py-1 text-sm whitespace-pre-line ${m.role === "user" ? "bg-brand-orange/10" : "bg-muted"} ${m.topic === false ? "border border-destructive/40" : ""}`}>
                            <span className="font-semibold">{m.role === "user" ? "שאלה: " : "העוזר: "}</span>{m.text}
                          </p>
                        ))}
                        <Button type="button" size="sm" variant="outline" onClick={() => addExample(first)}>הוסף לדוגמאות</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {more && <Button type="button" variant="outline" onClick={() => void loadAsked(asked?.length ?? 0)}>טען עוד</Button>}
        </Card>
      )}
    </div>
  );
};
