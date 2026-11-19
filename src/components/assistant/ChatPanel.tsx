import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Send } from "lucide-react";
import {
  AssistantError, clearPending, insertPlan, requestPlan, savePending, sendMessage,
  type ConversationRow, type PlanResult, type ReplyKind,
} from "@/lib/assistant";
import { PlanView } from "./PlanView";

// The conversation (K47). The assistant asks one question at a time (3 to 5), then returns the plan (K48).
// A guest finishes the conversation and gets the result free; "save my plan" sends him to sign up / log in and the
// plan waits in this browser. A signed-in user saves it straight to his account and can keep talking afterwards.

interface Bubble { role: "user" | "assistant"; text: string; kind?: ReplyKind }

const WELCOME: Bubble = {
  role: "assistant",
  text: "שלום, אני העוזר העסקי לקליניקה. נתחיל בשאלה: איפה למצוא את הלקוחות הראשונים שלכם? ספרו לי במשפט או שניים על הקליניקה שלכם ועל מה שמטריד אתכם, ואמשיך משם.",
};

const STARTERS = [
  "אני מטפל/ת חדש/ה ואין לי עדיין לקוחות",
  "יש לי כמה לקוחות ואני רוצה עוד",
  "אני לא יודע/ת מאיפה להתחיל",
];

interface Props {
  userId: string | null;
  initial?: ConversationRow | null;
  onNewChat: () => void;
  onSaved?: () => void;
}

export const ChatPanel = ({ userId, initial, onNewChat, onSaved }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    initial ? [WELCOME, ...initial.messages.map((m) => ({ role: m.role, text: m.text, kind: m.kind }))] : [WELCOME]);
  const [convId, setConvId] = useState<string | null>(initial?.id ?? null);
  const [options, setOptions] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResult | null>(initial?.result ?? null);
  const [locked, setLocked] = useState(initial?.status === "locked");
  const [turns, setTurns] = useState(initial?.turns ?? 0);
  const [maxTurns, setMaxTurns] = useState(5);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [guestEnded, setGuestEnded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [bubbles.length, result, planning]);

  const lastKind = bubbles[bubbles.length - 1]?.kind;
  const canMakePlan = !result && lastKind === "ready" && !planning && !!convId;
  const inputDisabled = busy || planning || locked || (!userId && (!!result || guestEnded)) || canMakePlan;
  const started = bubbles.length > 1;

  const doPlan = async (id: string) => {
    setPlanning(true);
    setError("");
    try {
      const r = await requestPlan(id);
      if (r.result) {
        setResult(r.result);
        if (!userId) savePending(r.result, id); // so a guest who leaves does not lose it
      }
    } catch (e) {
      setError(e instanceof AssistantError ? e.message : "לא הצלחתי להכין את התוכנית. נסו שוב");
    } finally {
      setPlanning(false);
    }
  };

  const send = async (raw: string) => {
    const t = raw.trim();
    if (t.length < 2 || inputDisabled) return;
    setBubbles((b) => [...b, { role: "user", text: t }]);
    setInput("");
    setOptions([]);
    setError("");
    setBusy(true);
    try {
      const r = await sendMessage(t, convId);
      setConvId(r.conversation_id);
      if (typeof r.turns === "number") setTurns(r.turns);
      if (r.max_turns) setMaxTurns(r.max_turns);
      if (r.text) setBubbles((b) => [...b, { role: "assistant", text: r.text!, kind: r.kind }]);
      setOptions(r.options ?? []);
      if (r.locked) setLocked(true);
      setBusy(false);
      if (r.kind === "ready") await doPlan(r.conversation_id);
    } catch (e) {
      // the message was not accepted: take it back so nothing looks answered, and put the text back in the box
      setBubbles((b) => b.slice(0, -1));
      setInput(t);
      const code = e instanceof AssistantError ? e.code : "error";
      if (code === "locked") setLocked(true);
      if (code === "guest_done" || code === "too_long" || code === "guest_limit") setGuestEnded(!userId);
      setError(e instanceof Error ? e.message : "משהו השתבש, נסו שוב");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); }
  };

  const save = async () => {
    if (!result) return;
    if (!userId) {
      savePending(result, convId);
      navigate("/auth?redirect=/assistant");
      return;
    }
    try {
      await insertPlan(userId, result, convId);
      clearPending();
      setSaved(true);
      toast({ title: "התוכנית נשמרה" });
      onSaved?.();
    } catch (e) {
      toast({ title: "לא הצלחתי לשמור", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4" data-area="K47">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {!result && started && !locked && `שאלה ${Math.min(turns + 1, maxTurns)} מתוך כ-${maxTurns}`}
          {result && "התוכנית מוכנה"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onNewChat}>
          <Plus className="h-4 w-4 ml-1" /> שיחה חדשה
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="space-y-3" aria-live="polite">
          {bubbles.map((b, i) => (
            <div key={i} className={b.role === "user" ? "flex justify-start" : "flex justify-end"}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-2 whitespace-pre-line text-right ${b.role === "user" ? "bg-brand-orange/15 text-foreground" : "bg-muted text-foreground"}`}>
                {b.text}
              </div>
            </div>
          ))}
          {(busy || planning) && (
            <div className="flex justify-end">
              <div className="rounded-2xl bg-muted px-4 py-2 text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {planning ? "מכין את התוכנית שלכם..." : "חושב..."}
              </div>
            </div>
          )}
        </div>

        {!started && !busy && (
          <div className="flex flex-wrap gap-2 pt-1">
            {STARTERS.map((s) => (
              <Button key={s} type="button" variant="outline" size="sm" onClick={() => void send(s)}>{s}</Button>
            ))}
          </div>
        )}
        {options.length > 0 && !busy && !planning && (
          <div className="flex flex-wrap gap-2 pt-1">
            {options.map((o) => (
              <Button key={o} type="button" variant="outline" size="sm" onClick={() => void send(o)}>{o}</Button>
            ))}
          </div>
        )}

        {canMakePlan && (
          <div className="pt-1">
            <Button type="button" variant="cta" onClick={() => convId && void doPlan(convId)}>הכינו לי את התוכנית</Button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive text-right">{error}</p>}
        {!userId && guestEnded && (
          <div className="rounded-lg border border-brand-orange/40 bg-brand-orange/5 p-4 text-right space-y-2" role="status" data-testid="guest-register">
            <p className="font-medium text-foreground">כדי להמשיך לשוחח עם העוזר הירשמו חינם.</p>
            <p className="text-sm text-muted-foreground">אחרי ההרשמה אפשר לשוחח בחופשיות, ותוכנית שכבר קיבלתם תחכה לכם ותישמר בחשבון.</p>
            <Button type="button" variant="cta" onClick={() => navigate("/auth?redirect=/assistant")}>הרשמה חינם</Button>
          </div>
        )}

        {locked ? (
          <p className="text-sm text-muted-foreground text-right">השיחה הזאת נסגרה. אפשר להתחיל שיחה חדשה.</p>
        ) : (
          <div className="flex items-end gap-2 pt-1">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              maxLength={1000}
              rows={2}
              disabled={inputDisabled}
              placeholder={result ? (userId ? "אפשר להמשיך ולשאול על התוכנית" : "להמשך שיחה הירשמו חינם") : "כתבו כאן"}
              aria-label="ההודעה שלכם"
            />
            <Button type="button" variant="cta" onClick={() => void send(input)} disabled={inputDisabled || input.trim().length < 2} aria-label="שליחה">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground text-right">
          השיחות נשמרות באופן אנונימי לשיפור השירות. אל תכתבו פרטים מזהים של מטופלים.
        </p>
      </Card>

      {result && (
        <Card className="p-5 space-y-5" data-area="K48">
          <h2 className="text-xl font-bold text-foreground text-right">התוכנית שלכם</h2>
          <PlanView plan={result} />
          <div className="border-t border-border pt-4 text-right space-y-2">
            {saved ? (
              <p className="text-emerald-700 font-medium">נשמרה בחשבון שלכם. אפשר למצוא אותה בלשונית &quot;התוכניות שלי&quot;.</p>
            ) : (
              <>
                <Button type="button" variant="cta" size="lg" onClick={save}>שמור את התוכנית שלי</Button>
                {!userId && <p className="text-sm text-muted-foreground">ההרשמה חינם. התוכנית תחכה לכם אחרי ההתחברות, ואפשר יהיה לחזור, לערוך ולהמשיך לשוחח.</p>}
              </>
            )}
          </div>
        </Card>
      )}
      <div ref={endRef} />
    </div>
  );
};
