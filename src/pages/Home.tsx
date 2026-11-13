import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// "הבית שלי" (M17): three views of the same page, the therapist picks which one to see.
// Read-only. The reminders, bookings and finance tiles only LINK to the existing dashboard.

type View = "tiles" | "day" | "side";
type Tier = "free" | "basic" | "premium" | "vip";

const VIEW_KEY = "home-view";
const VIEWS: { id: View; label: string }[] = [
  { id: "tiles", label: "אריחים" },
  { id: "day", label: "היום שלי" },
  { id: "side", label: "תפריט צד" },
];

const readView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "tiles" || v === "day" || v === "side") return v;
  } catch { /* storage may be blocked */ }
  return "tiles";
};

interface Appt { id: string; patient_name: string | null; time: string | null; service: string | null }
interface Task { id: string; title: string; due_date: string | null }
interface Item {
  key: string;
  icon: string;
  title: string;
  sub: string;
  href: string;
  external?: boolean;
  count?: number;
  lockedTier?: string; // shown when locked
}

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const Home = () => {
  const { user, profile, isLoading, isAdmin, canAccessTier } = useAuth();
  const [view, setView] = useState<View>(readView);
  const [courseCount, setCourseCount] = useState<number | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [financeOn, setFinanceOn] = useState(false);

  const pick = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  };

  const premium = canAccessTier("premium" as Tier);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const db = supabase as any;
    (async () => {
      const day = today();
      const [c, cl, ap, tk, fin] = await Promise.all([
        db.from("courses").select("id", { count: "exact", head: true }).eq("is_published", true),
        premium ? db.from("clients").select("id", { count: "exact", head: true }).eq("user_id", user.id) : Promise.resolve({}),
        premium ? db.from("appointments").select("id,patient_name,time,service").eq("user_id", user.id).eq("date", day).order("time") : Promise.resolve({}),
        premium ? db.from("tasks").select("id,title,due_date").eq("user_id", user.id).eq("status", "pending").or(`due_date.is.null,due_date.lte.${day}`).limit(8) : Promise.resolve({}),
        db.from("profiles").select("finance_enabled").eq("id", user.id).maybeSingle(),
      ]);
      if (!alive) return;
      setCourseCount(c?.count ?? 0);
      setClientCount(cl?.count ?? null);
      setAppts(ap?.data ?? []);
      setTasks(tk?.data ?? []);
      setFinanceOn(!!fin?.data?.finance_enabled);
    })().catch(() => { if (alive) setCourseCount(0); });
    return () => { alive = false; };
  }, [user, premium]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }
  if (!user) return <Navigate to="/auth?redirect=/home" replace />;

  const canFinance = isAdmin || financeOn;
  const name = (profile?.full_name || "").split(" ")[0];

  const items: Item[] = [
    { key: "courses", icon: "📚", title: "קורסים", sub: "ללמוד ולהתקדם", href: "/courses", count: courseCount ?? undefined },
    premium
      ? { key: "clients", icon: "👥", title: "מטופלים", sub: "הרשימה והתיקים", href: "/crm", count: clientCount ?? undefined }
      : { key: "clients", icon: "👥", title: "מטופלים", sub: "ניהול מטופלים", href: "/pricing", lockedTier: "פרימיום" },
    premium
      ? { key: "booking", icon: "📅", title: "תורים", sub: appts.length ? `${appts.length} היום` : "אין תורים היום", href: "/carlos-dashboard/#booking-mgmt", external: true, count: appts.length || undefined }
      : { key: "booking", icon: "📅", title: "תורים", sub: "זימון תורים", href: "/pricing", lockedTier: "פרימיום" },
    premium
      ? { key: "tasks", icon: "⏰", title: "תזכורות", sub: tasks.length ? `${tasks.length} פתוחות` : "אין משימות פתוחות", href: "/carlos-dashboard/#tasks", external: true, count: tasks.length || undefined }
      : { key: "tasks", icon: "⏰", title: "תזכורות", sub: "משימות ותזכורות", href: "/pricing", lockedTier: "פרימיום" },
    canFinance
      ? { key: "finance", icon: "💰", title: "כספים", sub: "הכנסות והוצאות", href: "/carlos-dashboard/#finance", external: true }
      : { key: "finance", icon: "💰", title: "כספים", sub: "לא פעיל בחשבון שלך", href: "/pricing", lockedTier: "בהרשאה" },
    { key: "board", icon: "🪑", title: "לוח יד שנייה", sub: "ציוד למטפלים", href: "/board" },
  ];

  const go = (it: Item, cls: string, children: React.ReactNode) =>
    it.external ? (
      <a key={it.key} href={it.href} className={cls}>{children}</a>
    ) : (
      <Link key={it.key} to={it.href} className={cls}>{children}</Link>
    );

  const tileCls = (it: Item) =>
    `relative block rounded-2xl border p-5 min-h-[7.5rem] text-right transition ${
      it.lockedTier ? "bg-muted border-border" : "bg-card border-border hover:border-primary hover:-translate-y-0.5 shadow-sm"
    }`;

  const tileBody = (it: Item) => (
    <>
      <div className={`text-3xl ${it.lockedTier ? "opacity-50" : ""}`}>{it.icon}</div>
      <b className={`block mt-2 text-lg ${it.lockedTier ? "opacity-50" : ""}`}>{it.title}</b>
      <span className="text-sm text-muted-foreground">{it.sub}</span>
      {it.count ? (
        <span className="absolute top-3 left-3 min-w-[1.6rem] h-[1.6rem] px-2 rounded-full bg-primary text-primary-foreground text-sm font-bold grid place-items-center">{it.count}</span>
      ) : null}
      {it.lockedTier && (
        <span className="mt-2 flex items-center gap-1 text-sm font-bold text-amber-600"><Lock size={14} />זמין ב{it.lockedTier}</span>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main data-area="K30" className="container py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{name ? `שלום ${name}` : "הבית שלי"}</h1>
            <p className="text-muted-foreground">מה רוצים לעשות היום?</p>
          </div>
          <div data-area="K31" role="group" aria-label="תצוגה" className="flex gap-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={view === v.id}
                onClick={() => pick(v.id)}
                className={`px-4 py-1.5 rounded-full border text-sm ${view === v.id ? "bg-primary text-primary-foreground border-primary font-bold" : "bg-card text-muted-foreground border-border hover:bg-accent"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {view === "tiles" && (
          <div data-area="K32" className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {items.map((it) => go(it, tileCls(it), tileBody(it)))}
          </div>
        )}

        {view === "day" && (
          <div data-area="K33">
            <div className="grid md:grid-cols-[1.5fr_1fr] gap-4">
              <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <h2 className="font-bold mb-2">התורים להיום</h2>
                {!premium ? (
                  <p className="text-sm text-muted-foreground">זימון תורים זמין בפרימיום. <Link className="text-primary font-semibold" to="/pricing">למחירים</Link></p>
                ) : appts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין תורים היום.</p>
                ) : (
                  appts.map((a) => (
                    <div key={a.id} className="flex gap-3 items-center py-2 border-t first:border-t-0">
                      <time className="font-bold text-primary min-w-[3rem]" dir="ltr">{(a.time || "").slice(0, 5)}</time>
                      <span>{a.patient_name || "מטופל"}</span>
                      <small className="mr-auto text-muted-foreground">{a.service}</small>
                    </div>
                  ))
                )}
              </section>
              <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <h2 className="font-bold mb-2 flex justify-between">
                  <span>משימות פתוחות</span>
                  {premium && <a className="text-sm text-primary font-semibold" href="/carlos-dashboard/#tasks">הכול</a>}
                </h2>
                {!premium ? (
                  <p className="text-sm text-muted-foreground">תזכורות ומשימות זמינות בפרימיום.</p>
                ) : tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין משימות פתוחות.</p>
                ) : (
                  tasks.map((t) => <div key={t.id} className="py-2 border-t first:border-t-0">{t.title}</div>)
                )}
              </section>
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              {items.map((it) =>
                go(it, `flex-1 basis-40 rounded-xl border px-4 py-2.5 font-semibold flex gap-2 items-center ${it.lockedTier ? "bg-muted text-muted-foreground" : "bg-card hover:border-primary"}`, (
                  <>
                    <span>{it.icon}</span>{it.title}
                    {it.lockedTier && <em className="mr-auto text-xs not-italic text-amber-600">{it.lockedTier}</em>}
                  </>
                ))
              )}
            </div>
          </div>
        )}

        {view === "side" && (
          <div data-area="K34" className="grid md:grid-cols-[14rem_1fr] gap-4">
            <nav className="rounded-2xl border bg-card p-3 flex md:flex-col gap-1 overflow-x-auto">
              {items.map((it) =>
                go(it, `flex gap-2 items-center px-3 py-2 rounded-lg whitespace-nowrap ${it.lockedTier ? "text-muted-foreground" : "font-semibold hover:bg-muted"}`, (
                  <>
                    <span>{it.icon}</span>{it.title}
                    {it.count ? <span className="mr-auto min-w-[1.4rem] h-[1.4rem] px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold grid place-items-center">{it.count}</span> : null}
                    {it.lockedTier && <Lock size={13} className="mr-auto text-amber-600" />}
                  </>
                ))
              )}
            </nav>
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl border bg-card p-4 shadow-sm"><b className="text-2xl block">{courseCount ?? "–"}</b><span className="text-sm text-muted-foreground">קורסים</span></div>
                <div className="rounded-xl border bg-card p-4 shadow-sm"><b className="text-2xl block">{premium ? appts.length : "–"}</b><span className="text-sm text-muted-foreground">תורים היום</span></div>
                <div className="rounded-xl border bg-card p-4 shadow-sm"><b className="text-2xl block">{premium ? tasks.length : "–"}</b><span className="text-sm text-muted-foreground">משימות פתוחות</span></div>
              </div>
              <Link to="/courses" className="block rounded-2xl border bg-card p-4 shadow-sm hover:border-primary">
                📚 <b>להמשיך ללמוד</b> <span className="text-sm text-muted-foreground">— לכל הקורסים</span>
              </Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Home;
