import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, SubscriptionTier } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { TIER_OPTIONS, TIER_LABELS } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Loader2, Search, User } from "lucide-react";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface HistoryRow {
  id: number;
  changed_at: string;
  changed_by: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
}

const PAGE_SIZE = 25;
const PAGE_FETCH = 1000; // PostgREST returns at most 1000 rows a call; we page through

const fmt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })
    : "—";
const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { dateStyle: "medium" }) : "—";

const tierName = (v: string | null) => (v && TIER_LABELS[v as SubscriptionTier]) || v || "—";

const describe = (h: HistoryRow): string => {
  switch (h.field) {
    case "signup":
      return `נרשם (דרגה ${tierName(h.new_value)})`;
    case "subscription_tier": {
      const order = ["free", "basic", "premium", "vip"];
      const up = order.indexOf(h.new_value ?? "") > order.indexOf(h.old_value ?? "");
      return `${up ? "שודרג" : "הורד"} מ${tierName(h.old_value)} ל${tierName(h.new_value)}`;
    }
    case "finance_enabled":
      return h.new_value === "true" ? "מתג הכספים הופעל" : "מתג הכספים כובה";
    case "subscription_expires_at":
      return `תוקף המנוי שונה ל-${h.new_value ? fmtDay(h.new_value) : "ללא הגבלה"}`;
    default:
      return h.field;
  }
};

export const UsersManager = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | SubscriptionTier>("all");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryRow[] | "missing">>({});
  const { toast } = useToast();

  const fetchProfiles = async () => {
    setIsLoading(true);
    const all: Profile[] = [];
    for (let from = 0; ; from += PAGE_FETCH) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_FETCH - 1);
      if (error || !data) break;
      all.push(...data);
      if (data.length < PAGE_FETCH) break;
    }
    setProfiles(all);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const loadHistory = async (id: string) => {
    const { data, error } = await (supabase as any)
      .from("profile_history")
      .select("id,changed_at,changed_by,field,old_value,new_value")
      .eq("user_id", id)
      .order("changed_at", { ascending: false })
      .limit(100);
    // before the migration ran the table does not exist
    setHistory((h) => ({ ...h, [id]: error ? "missing" : (data as HistoryRow[]) }));
  };

  const toggleOpen = (id: string) => {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    if (!history[id]) loadHistory(id);
  };

  const changeTier = async (profile: Profile, tier: SubscriptionTier) => {
    setSavingId(profile.id);
    const { error } = await supabase
      .from("profiles")
      .update({ subscription_tier: tier })
      .eq("id", profile.id);
    setSavingId(null);

    if (error) {
      toast({ title: "עדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, subscription_tier: tier } : p))
    );
    if (openId === profile.id) loadHistory(profile.id);
    else setHistory((h) => { const { [profile.id]: _drop, ...rest } = h; return rest; });
    toast({ title: "רמת המנוי עודכנה" });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { free: 0, basic: 0, premium: 0, vip: 0 };
    profiles.forEach((p) => { c[p.subscription_tier] = (c[p.subscription_tier] ?? 0) + 1; });
    return c;
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter(
      (p) =>
        (tierFilter === "all" || p.subscription_tier === tierFilter) &&
        (!q || (p.full_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q))
    );
  }, [profiles, query, tierFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const shown = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground">לא נמצאו משתמשים.</Card>
    );
  }

  return (
    <div className="space-y-3 text-right">
      <p className="text-sm text-muted-foreground">
        קביעת רמת המנוי של כל משתמש. לחיצה על שורה פותחת את פרטי המשתמש: מתי נרשם והיסטוריית השינויים.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            placeholder="חיפוש לפי שם או אימייל"
            className="pr-9"
          />
        </div>
        <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v as typeof tierFilter); setPage(0); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הדרגות ({profiles.length})</SelectItem>
            {TIER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label} ({counts[o.value] ?? 0})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">אין משתמשים שמתאימים לחיפוש.</Card>
      )}

      {shown.map((profile) => {
        const open = openId === profile.id;
        const h = history[profile.id];
        return (
          <Card key={profile.id} className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleOpen(profile.id)}
                aria-expanded={open}
                className="flex items-center gap-3 min-w-0 text-right flex-1"
              >
                <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
                  <User size={18} className="text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{profile.full_name || "ללא שם"}</p>
                  <p className="text-sm text-muted-foreground truncate text-right" dir="ltr" style={{ textAlign: "right" }}>
                    {profile.email}
                  </p>
                </div>
                <span className="hidden sm:block text-xs text-muted-foreground shrink-0">נרשם {fmtDay(profile.created_at)}</span>
                {open ? <ChevronUp size={18} className="shrink-0" /> : <ChevronDown size={18} className="shrink-0" />}
              </button>

              <div className="flex items-center gap-2 shrink-0">
                {savingId === profile.id && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                <Select
                  value={profile.subscription_tier}
                  onValueChange={(v) => changeTier(profile, v as SubscriptionTier)}
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {open && (
              <div className="mt-4 pt-3 border-t text-sm space-y-2">
                <div className="grid sm:grid-cols-3 gap-2">
                  <div><span className="text-muted-foreground">נרשם: </span><b>{fmt(profile.created_at)}</b></div>
                  <div><span className="text-muted-foreground">עדכון אחרון בפרופיל: </span><b>{fmt(profile.updated_at)}</b></div>
                  <div>
                    <span className="text-muted-foreground">תוקף המנוי: </span>
                    <b>{profile.subscription_expires_at ? fmtDay(profile.subscription_expires_at) : "ללא הגבלה"}</b>
                  </div>
                </div>
                <p className="font-semibold pt-1">היסטוריית שינויים</p>
                {!h ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : h === "missing" ? (
                  <p className="text-muted-foreground">
                    ההיסטוריה עדיין לא פעילה. צריך להריץ ב-Supabase את קובץ ה-SQL "היסטוריית משתמשים". עד אז רואים רק את תאריך ההרשמה.
                  </p>
                ) : h.length === 0 ? (
                  <p className="text-muted-foreground">אין שינויים מתועדים. שינויים ייכתבו כאן מרגע שההיסטוריה הופעלה.</p>
                ) : (
                  <ul className="space-y-1">
                    {h.map((r) => (
                      <li key={r.id} className="flex flex-wrap gap-x-3">
                        <time className="text-muted-foreground tabular-nums">{fmt(r.changed_at)}</time>
                        <span>{describe(r)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            מציג {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} מתוך {filtered.length}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>הקודם</Button>
            <span className="text-sm self-center">{safePage + 1} / {pages}</span>
            <Button variant="outline" size="sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>הבא</Button>
          </div>
        </div>
      )}
    </div>
  );
};
