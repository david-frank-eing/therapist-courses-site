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
type Part = "guide" | "asked" | "stats";

// the funnel (K53): from the function admin_assistant_stats, no personal data
const STAT_LABELS: [string, string][] = [
  ["welcome_views", "כניסות לדף /welcome"],
  ["assistant_views", "כניסות לדף העוזר"],
  ["chats_guest", "שיחות שהתחילו (אורחים)"],
  ["chats_registered", "שיחות שהתחילו (רשומים)"],
  ["plans_made", "תוכניות שהתקבלו"],
  ["plans_saved", "תוכניות שנשמרו בחשבון"],
  ["signups", "הרשמות לאתר"],
  ["leads", "פניות מהטופס"],
  ["off_topic_messages", "הודעות מחוץ לנושא"],
];

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

  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (part !== "stats") return;
    setStats(null);
    (supabase as any).rpc("admin_assistant_stats", { p_days: days }).then(({ data, error }: any) => {
      if (error) { toast({ title: "הסטטיסטיקה לא נטענה", description: error.message, variant: "destructive" }); setStats({}); return; }
      setStats(Object.fromEntries((data ?? []).map((r: { metric: string; value: number }) => [r.metric, Number(r.value)])));
    });
  }, [part, days]); // eslint-disable-line react-hooks/exhaustive-deps

  // earlier versions of the instructions (table assistant_config_history, filled by a database trigger on every save)
  const [versions, setVersions] = useState<(Cfg & { id: number; created_at: string })[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    if (!showHistory || versions !== null) return;
    (supabase as any).from("assistant_config_history").select("id,created_at,guidelines,question_bank,examples").order("id", { ascending: false }).limit(30)
      .then(({ data, error }: any) => {
        if (error) { toast({ title: "ההיסטוריה לא נטענה", description: error.message, variant: "destructive" }); setVersions([]); return; }
        setVersions(data ?? []);
      });
  }, [showHistory, versions]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = cfg.guidelines.length + cfg.question_bank.length + cfg.examples.length;
  const dirty = !!saved && (saved.guidelines !== cfg.guidelines || saved.question_bank !== cfg.question_bank || saved.examples !== cfg.examples);

  const save = async () => {
    if (total > TOTAL_MAX) return toast({ title: `יש יותר מדי טקסט (${total} מתוך ${TOTAL_MAX})`, variant: "destructive" });
    setSaving(true);
    const { error } = await (supabase as any).from("assistant_config").update({ ...cfg, updated_at: new Date().toISOString() }).eq("id", 1);
    setSaving(false);
    if (error) return toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
    setSaved(cfg);
    setVersions(null); // the save added a version: reload the history next time it is opened
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
        <Button type="button" variant={part === "stats" ? "default" : "outline"} size="sm" onClick={() => setPart("stats")}>סטטיסטיקה</Button>
      </div>

      {part === "stats" && (
        <Card className="p-5 space-y-4" data-area="K53">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">המסלול מהכניסה לדף ועד הרשמה. בלי עוגיות ובלי מידע אישי.</p>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="טווח זמן">
              <option value={1}>היום האחרון</option>
              <option value={7}>7 ימים</option>
              <option value={30}>30 ימים</option>
            </select>
          </div>
          {stats === null ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {STAT_LABELS.map(([key, label]) => (
                  <div key={key} className="rounded-lg border border-border p-4 text-right">
                    <p className="text-3xl font-bold text-foreground">{stats[key] ?? 0}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {(stats.assistant_views ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground text-right">
                  מי שנכנס לדף העוזר והתחיל שיחה: {Math.round((((stats.chats_guest ?? 0) + (stats.chats_registered ?? 0)) / stats.assistant_views) * 100)}%
                </p>
              )}
            </>
          )}
        </Card>
      )}

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

      {part === "guide" && saved && (
        <Card className="p-5 space-y-3">
          <button type="button" className="w-full flex items-center justify-between text-right" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <span className="font-bold text-foreground">היסטוריית גרסאות של ההנחיות</span>
            <span className="text-sm text-muted-foreground">{showHistory ? "הסתר" : "הצג"}</span>
          </button>
          {showHistory && (versions === null ? <Loader2 className="h-5 w-5 animate-spin" /> : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">עוד אין גרסאות שמורות.</p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v, i) => (
                <li key={v.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                  <div className="text-right min-w-0">
                    <p className="text-sm font-medium text-foreground">{fmt(v.created_at)}{i === 0 && " · הגרסה הנוכחית"}</p>
                    <p className="text-xs text-muted-foreground truncate">{(v.guidelines || v.question_bank || v.examples || "(ריק)").slice(0, 90)}</p>
                    <p className="text-xs text-muted-foreground">{v.guidelines.length + v.question_bank.length + v.examples.length} תווים</p>
                  </div>
                  {i > 0 && (
                    <Button type="button" size="sm" variant="outline" onClick={() => { setCfg({ guidelines: v.guidelines, question_bank: v.question_bank, examples: v.examples }); toast({ title: "הגרסה נטענה לעורך. לחצו שמור כדי להחזיר אותה" }); }}>
                      טען לעורך
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ))}
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
