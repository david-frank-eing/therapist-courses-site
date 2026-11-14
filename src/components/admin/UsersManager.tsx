import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Loader2, Search, Trash2, UserPlus, X } from "lucide-react";
import { FEATURES, TIERS, isAllowed, tierName, useTierData, type Tier } from "@/lib/tiers";

// "משתמשים" (K7): built like the user lists of other admin tools (Google Admin, Stripe, Supabase):
// counters you can click to filter, a table you can sort, and a side panel with everything about one user.

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  subscription_tier: Tier;
  subscription_expires_at: string | null;
  created_at: string;
  updated_at: string | null;
  is_admin?: boolean | null;
  finance_enabled?: boolean | null;
}

interface HistoryRow {
  id: number;
  changed_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
}

type Status = "pending" | "active" | "admin";
type View = "all" | Status;
type SortKey = "name" | "tier" | "created_at";

const PAGE_SIZE = 25;
const PAGE_FETCH = 1000; // PostgREST returns at most 1000 rows a call

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" }) : "—";
const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { dateStyle: "medium" }) : "—";
const dayInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const expired = (iso: string | null | undefined) => !!iso && new Date(iso) < new Date();

const TIER_STYLE: Record<Tier, string> = {
  free: "bg-muted text-muted-foreground",
  basic: "bg-sky-100 text-sky-800",
  premium: "bg-primary/15 text-primary",
  vip: "bg-amber-100 text-amber-800",
};
const STATUS_LABEL: Record<Status, string> = { pending: "ממתין לאישור", active: "פעיל", admin: "מנהל" };
const STATUS_STYLE: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  admin: "bg-violet-100 text-violet-800",
};

// calls the admin function the dashboard already uses (it needs the service key for finance, invite, delete)
const adminCall = async (body: Record<string, unknown>) => {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/.netlify/functions/admin-users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token ?? "") },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "שגיאת שרת " + res.status);
  return json;
};

export const UsersManager = () => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { plans, access } = useTierData();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "created_at", dir: -1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // a reload after an invite keeps the screen (and the invite window with its link) in place
  const load = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    const all: UserRow[] = [];
    for (let from = 0; ; from += PAGE_FETCH) {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_FETCH - 1);
      if (error || !data) break;
      all.push(...data);
      if (data.length < PAGE_FETCH) break;
    }
    setUsers(all);
    setIsLoading(false);
  };
  useEffect(() => { load(); }, []);

  // "ממתין" = the plan opens none of the work tools (the same rule the dashboard gate uses)
  const statusOf = (u: UserRow): Status =>
    u.is_admin ? "admin" : FEATURES.some((f) => isAllowed(access, f.id, u.subscription_tier)) ? "active" : "pending";

  const counts = useMemo(() => {
    const c = { all: users.length, pending: 0, active: 0, admin: 0 };
    users.forEach((u) => { c[statusOf(u)]++; });
    return c;
  }, [users, access]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = users.filter(
      (u) =>
        (view === "all" || statusOf(u) === view) &&
        (tierFilter === "all" || u.subscription_tier === tierFilter) &&
        (!q || (u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))
    );
    const val = (u: UserRow) =>
      sort.key === "name" ? (u.full_name || u.email || "").toLowerCase()
        : sort.key === "tier" ? String(TIERS.indexOf(u.subscription_tier))
        : u.created_at;
    return rows.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [users, query, view, tierFilter, sort, access]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const shown = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const open = users.find((u) => u.id === openId) ?? null;

  const patchLocal = (id: string, patch: Partial<UserRow>) =>
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const setTier = async (ids: string[], tier: Tier) => {
    setBusy("tier");
    const { error } = await (supabase as any).from("profiles").update({ subscription_tier: tier }).in("id", ids);
    setBusy(null);
    if (error) return toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
    setUsers((prev) => prev.map((u) => (ids.includes(u.id) ? { ...u, subscription_tier: tier } : u)));
    toast({ title: ids.length === 1 ? `התכנית עודכנה ל${tierName(plans, tier)}` : `${ids.length} משתמשים עברו ל${tierName(plans, tier)}` });
    return true;
  };

  const setFinance = async (u: UserRow, on: boolean) => {
    setBusy("finance");
    try {
      await adminCall({ action: "set_finance", userId: u.id, enabled: on });
      patchLocal(u.id, { finance_enabled: on });
      toast({ title: on ? "אזור הכספים נפתח למשתמש" : "אזור הכספים נסגר למשתמש" });
    } catch (e) {
      toast({ title: "העדכון נכשל", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(null);
  };

  const setExpiry = async (u: UserRow, day: string) => {
    const value = day ? new Date(day + "T23:59:59").toISOString() : null;
    setBusy("expiry");
    const { error } = await (supabase as any).from("profiles").update({ subscription_expires_at: value }).eq("id", u.id);
    setBusy(null);
    if (error) return toast({ title: "העדכון נכשל", description: error.message, variant: "destructive" });
    patchLocal(u.id, { subscription_expires_at: value });
    toast({ title: value ? `התוקף עודכן ל-${fmtDay(value)}` : "התוקף הוסר (ללא הגבלה)" });
  };

  const remove = async (u: UserRow) => {
    const ok = await confirm({
      title: `למחוק את ${u.full_name || u.email}?`,
      text: "החשבון וכל הנתונים שלו (מטופלים, משימות, תורים) יימחקו לצמיתות. אי אפשר לבטל.",
      danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await adminCall({ action: "delete_user", userId: u.id });
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setOpenId(null);
      toast({ title: "המשתמש נמחק" });
    } catch (e) {
      toast({ title: "המחיקה נכשלה", description: (e as Error).message, variant: "destructive" });
    }
    setBusy(null);
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "created_at" ? -1 : 1 }));
  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? <ArrowUpDown size={14} className="opacity-40" /> : sort.dir === 1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />;

  const allShownSelected = shown.length > 0 && shown.every((u) => selected.has(u.id));
  const toggleAllShown = () =>
    setSelected((s) => {
      const n = new Set(s);
      shown.forEach((u) => (allShownSelected ? n.delete(u.id) : n.add(u.id)));
      return n;
    });
  const toggleOne = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const views: { id: View; label: string }[] = [
    { id: "all", label: "כל המשתמשים" },
    { id: "pending", label: "ממתינים לאישור" },
    { id: "active", label: "פעילים" },
    { id: "admin", label: "מנהלים" },
  ];

  return (
    <div className="space-y-4 text-right">
      {/* counters that filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="tablist" aria-label="סינון לפי מצב">
        {views.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => { setView(v.id); setPage(0); }}
            className={`rounded-xl border p-3 text-right transition ${
              view === v.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:border-primary/50"
            }`}
          >
            <div className="text-2xl font-bold tabular-nums">{counts[v.id]}</div>
            <div className={`text-sm ${v.id === "pending" && counts.pending > 0 ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
              {v.label}
            </div>
          </button>
        ))}
      </div>

      {/* toolbar */}
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
          <SelectTrigger className="w-40" aria-label="סינון לפי תכנית"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל התכניות</SelectItem>
            {TIERS.map((t) => <SelectItem key={t} value={t}>{tierName(plans, t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setInviteOpen(true)} className="gap-1"><UserPlus size={16} />הזמנת משתמש</Button>
      </div>

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <b>נבחרו {selected.size}</b>
          <span className="text-muted-foreground">להעביר לתכנית:</span>
          {TIERS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant="outline"
              disabled={busy === "tier"}
              onClick={async () => { if (await setTier([...selected], t)) setSelected(new Set()); }}
            >
              {tierName(plans, t)}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="mr-auto gap-1" onClick={() => setSelected(new Set())}><X size={14} />ניקוי הבחירה</Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {users.length === 0 ? "אין משתמשים עדיין." : view === "pending" ? "אין משתמשים שממתינים לאישור." : "אין משתמשים שמתאימים לחיפוש."}
        </Card>
      ) : (
        <>
          {/* desktop: table */}
          <Card className="hidden md:block overflow-hidden" data-area="K40">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="w-10 p-3">
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={allShownSelected} onChange={toggleAllShown} aria-label="בחירת כל המשתמשים בעמוד" />
                  </th>
                  <th className="p-3 text-right font-medium">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort("name")}>משתמש <SortIcon k="name" /></button>
                  </th>
                  <th className="p-3 text-right font-medium">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort("tier")}>תכנית <SortIcon k="tier" /></button>
                  </th>
                  <th className="p-3 text-right font-medium">מצב</th>
                  <th className="p-3 text-right font-medium">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort("created_at")}>נרשם <SortIcon k="created_at" /></button>
                  </th>
                  <th className="p-3 text-right font-medium">תוקף</th>
                  <th className="p-3 text-center font-medium">כספים</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => {
                  const st = statusOf(u);
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setOpenId(u.id)}
                      className={`border-t cursor-pointer hover:bg-accent/50 ${selected.has(u.id) ? "bg-primary/5" : ""}`}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`בחירת ${u.full_name || u.email}`} />
                      </td>
                      <td className="p-3 max-w-[18rem]">
                        <div className="font-medium truncate">{u.full_name || "ללא שם"}</div>
                        <div className="text-xs text-muted-foreground truncate" dir="ltr" style={{ textAlign: "right" }}>{u.email}</div>
                      </td>
                      <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_STYLE[u.subscription_tier]}`}>{tierName(plans, u.subscription_tier)}</span></td>
                      <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span></td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDay(u.created_at)}</td>
                      <td className={`p-3 whitespace-nowrap ${expired(u.subscription_expires_at) ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {u.subscription_expires_at ? (expired(u.subscription_expires_at) ? "פג " : "") + fmtDay(u.subscription_expires_at) : "ללא הגבלה"}
                      </td>
                      <td className="p-3 text-center">{u.finance_enabled ? <Check size={16} className="inline text-primary" aria-label="כן" /> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* phone: one compact card per user */}
          <div className="md:hidden space-y-2" data-area="K40">
            {shown.map((u) => {
              const st = statusOf(u);
              return (
                <Card key={u.id} className="p-3 flex items-center gap-3" onClick={() => setOpenId(u.id)}>
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))] shrink-0" checked={selected.has(u.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleOne(u.id)} aria-label={`בחירת ${u.full_name || u.email}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{u.full_name || "ללא שם"}</div>
                    <div className="text-xs text-muted-foreground truncate" dir="ltr" style={{ textAlign: "right" }}>{u.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[u.subscription_tier]}`}>{tierName(plans, u.subscription_tier)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-sm text-muted-foreground">
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} מתוך {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>הקודם</Button>
                <span className="text-sm self-center">{safePage + 1} / {pages}</span>
                <Button variant="outline" size="sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>הבא</Button>
              </div>
            </div>
          )}
        </>
      )}

      <UserPanel
        user={open}
        status={open ? statusOf(open) : "pending"}
        busy={busy}
        onClose={() => setOpenId(null)}
        onTier={(t) => open && setTier([open.id], t)}
        onFinance={(v) => open && setFinance(open, v)}
        onExpiry={(d) => open && setExpiry(open, d)}
        onDelete={() => open && remove(open)}
      />

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={() => load(true)} />
    </div>
  );
};

// ---------- side panel: one user ----------

interface PanelProps {
  user: UserRow | null;
  status: Status;
  busy: string | null;
  onClose: () => void;
  onTier: (t: Tier) => void;
  onFinance: (v: boolean) => void;
  onExpiry: (day: string) => void;
  onDelete: () => void;
}

const UserPanel = ({ user, status, busy, onClose, onTier, onFinance, onExpiry, onDelete }: PanelProps) => {
  const { plans, access } = useTierData();
  const [history, setHistory] = useState<HistoryRow[] | "missing" | null>(null);
  const [expiryDraft, setExpiryDraft] = useState("");

  useEffect(() => {
    setHistory(null);
    setExpiryDraft(dayInput(user?.subscription_expires_at));
    if (!user) return;
    (supabase as any)
      .from("profile_history")
      .select("id,changed_at,field,old_value,new_value")
      .eq("user_id", user.id)
      .order("changed_at", { ascending: false })
      .limit(100)
      .then(({ data, error }: { data: HistoryRow[] | null; error: unknown }) => setHistory(error ? "missing" : data ?? []));
  }, [user?.id, user?.subscription_tier, user?.finance_enabled, user?.subscription_expires_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const describe = (h: HistoryRow): string => {
    switch (h.field) {
      case "signup": return `נרשם (תכנית ${tierName(plans, h.new_value)})`;
      case "subscription_tier": {
        const up = TIERS.indexOf(h.new_value as Tier) > TIERS.indexOf(h.old_value as Tier);
        return `${up ? "שודרג" : "הורד"} מ${tierName(plans, h.old_value)} ל${tierName(plans, h.new_value)}`;
      }
      case "finance_enabled": return h.new_value === "true" ? "אזור הכספים נפתח" : "אזור הכספים נסגר";
      case "subscription_expires_at": return `התוקף שונה ל-${h.new_value ? fmtDay(h.new_value) : "ללא הגבלה"}`;
      default: return h.field;
    }
  };

  const tools = user ? FEATURES.filter((f) => user.is_admin || isAllowed(access, f.id, user.subscription_tier)) : [];

  return (
    <Sheet open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto text-right" dir="rtl" data-area="K41">
        {user && (
          <div className="space-y-6">
            <SheetHeader className="pl-8 text-right sm:text-right">
              <SheetTitle className="text-xl">{user.full_name || "ללא שם"}</SheetTitle>
              <SheetDescription dir="ltr" className="text-right">{user.email}</SheetDescription>
              <div className="flex flex-wrap gap-1 pt-1">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_STYLE[user.subscription_tier]}`}>{tierName(plans, user.subscription_tier)}</span>
              </div>
            </SheetHeader>

            {status === "pending" && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
                <p>המשתמש נרשם ועוד לא קיבל תכנית שפותחת כלי עבודה. לאשר אותו?</p>
                <div className="flex flex-wrap gap-2">
                  {TIERS.filter((t) => FEATURES.some((f) => isAllowed(access, f.id, t))).map((t) => (
                    <Button key={t} size="sm" disabled={busy === "tier"} onClick={() => onTier(t)}>אישור כ{tierName(plans, t)}</Button>
                  ))}
                </div>
              </div>
            )}

            <section className="space-y-3">
              <h3 className="font-semibold">גישה</h3>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3 text-sm">
                <Label>תכנית</Label>
                <div className="flex items-center gap-2">
                  <Select value={user.subscription_tier} onValueChange={(v) => onTier(v as Tier)}>
                    <SelectTrigger className="w-40" aria-label="תכנית"><SelectValue /></SelectTrigger>
                    <SelectContent>{TIERS.map((t) => <SelectItem key={t} value={t}>{tierName(plans, t)}</SelectItem>)}</SelectContent>
                  </Select>
                  {busy === "tier" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                </div>

                <Label htmlFor="exp">תוקף המנוי</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input id="exp" type="date" className="w-40" value={expiryDraft} onChange={(e) => setExpiryDraft(e.target.value)} />
                  {expiryDraft !== dayInput(user.subscription_expires_at) && (
                    <Button size="sm" disabled={busy === "expiry"} onClick={() => onExpiry(expiryDraft)}>שמירה</Button>
                  )}
                  {user.subscription_expires_at && expiryDraft === dayInput(user.subscription_expires_at) && (
                    <Button size="sm" variant="ghost" disabled={busy === "expiry"} onClick={() => { setExpiryDraft(""); onExpiry(""); }}>ללא הגבלה</Button>
                  )}
                </div>

                <Label htmlFor="fin">אזור הכספים</Label>
                <div className="flex items-center gap-2">
                  <Switch id="fin" checked={!!user.finance_enabled} disabled={busy === "finance"} onCheckedChange={onFinance} />
                  <span className="text-muted-foreground">{user.finance_enabled ? "פתוח" : "סגור"}</span>
                </div>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">מה פתוח לו: </span>
                {tools.length === 0 ? "רק קורסים ולוח המודעות" : ["קורסים", ...tools.map((f) => f.label)].join(" · ")}
              </div>
            </section>

            <section className="space-y-1 text-sm">
              <h3 className="font-semibold mb-1">פרטים</h3>
              <div><span className="text-muted-foreground">נרשם: </span>{fmt(user.created_at)}</div>
              <div><span className="text-muted-foreground">עדכון אחרון: </span>{fmt(user.updated_at)}</div>
            </section>

            <section className="text-sm">
              <h3 className="font-semibold mb-2">היסטוריית שינויים</h3>
              {history === null ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : history === "missing" ? (
                <p className="text-muted-foreground">ההיסטוריה עדיין לא פעילה (צריך להריץ את ה-SQL "היסטוריית משתמשים").</p>
              ) : history.length === 0 ? (
                <p className="text-muted-foreground">אין שינויים מתועדים.</p>
              ) : (
                <ol className="relative border-r pr-4 space-y-3">
                  {history.map((r) => (
                    <li key={r.id}>
                      <span className="absolute -right-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                      <div>{describe(r)}</div>
                      <time className="text-xs text-muted-foreground tabular-nums">{fmt(r.changed_at)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {!user.is_admin && (
              <section className="border-t pt-4">
                <Button variant="outline" className="text-destructive gap-1" disabled={busy === "delete"} onClick={onDelete}>
                  <Trash2 size={16} />מחיקת המשתמש
                </Button>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

// ---------- invite ----------

const InviteDialog = ({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) => {
  const { toast } = useToast();
  const { plans } = useTierData();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<Tier>("premium");
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const reset = () => { setName(""); setEmail(""); setTier("premium"); setLink(null); };

  const send = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast({ title: "האימייל לא תקין", variant: "destructive" });
    setSending(true);
    try {
      const r = await adminCall({ action: "invite_user", email: email.trim(), name: name.trim() });
      // the invite always opens the account as premium; then set the plan that was picked
      if (tier !== "premium" && r.user?.id) await adminCall({ action: "set_tier", userId: r.user.id, tier });
      toast({ title: r.already_existed ? "המשתמש כבר היה רשום, התכנית שלו עודכנה" : "המשתמש נוצר" });
      setLink(r.login_link ?? null);
      onDone();
      if (!r.login_link) { reset(); onClose(); }
    } catch (e) {
      toast({ title: "ההזמנה נכשלה", description: (e as Error).message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent dir="rtl" className="text-right">
        <DialogHeader><DialogTitle>הזמנת משתמש</DialogTitle></DialogHeader>
        {link ? (
          <div className="space-y-3 text-sm">
            <p>החשבון נוצר. שלח למשתמש את הקישור הזה כדי שיבחר סיסמה:</p>
            <Input readOnly dir="ltr" value={link} onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={() => { navigator.clipboard?.writeText(link); toast({ title: "הקישור הועתק" }); }}>העתקת הקישור</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div><Label htmlFor="inv-name">שם</Label><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="inv-email">אימייל</Label><Input id="inv-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div>
              <Label>תכנית</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIERS.map((t) => <SelectItem key={t} value={t}>{tierName(plans, t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          {link ? (
            <Button variant="outline" onClick={() => { reset(); onClose(); }}>סגירה</Button>
          ) : (
            <Button onClick={send} disabled={sending || !email} className="gap-1">
              {sending && <Loader2 size={16} className="animate-spin" />}יצירת החשבון
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
