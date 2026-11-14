import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { loadProgress } from "@/lib/progress";

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
  lockedTier?: string; // shown when locked
}

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const Home = () => {
  const { user, profile, isLoading, isAdmin, can } = useAuth();
  const [view, setView] = useState<View>(readView);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [financeOn, setFinanceOn] = useState(false);
  const [lastCourse, setLastCourse] = useState<{ id: string; title: string } | null>(null);

  const pick = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  };

  const canClients = can("clients");
  const canTasks = can("tasks");
  const canBooking = can("booking");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const db = supabase as any;
    (async () => {
      const day = today();
      const [ap, tk, fin] = await Promise.all([
        canBooking ? db.from("appointments").select("id,patient_name,time,service").eq("user_id", user.id).eq("date", day).order("time") : Promise.resolve({}),
        canTasks ? db.from("tasks").select("id,title,due_date").eq("user_id", user.id).eq("status", "pending").or(`due_date.is.null,due_date.lte.${day}`).limit(8) : Promise.resolve({}),
        db.from("profiles").select("finance_enabled").eq("id", user.id).maybeSingle(),
      ]);
      if (!alive) return;
      setAppts(ap?.data ?? []);
      setTasks(tk?.data ?? []);
      setFinanceOn(!!fin?.data?.finance_enabled);
      // the course this user opened last, for "להמשיך ללמוד"
      const prog = await loadProgress(user.id);
      const last = prog?.[0]?.course_id;
      if (last) {
        const { data } = await db.from("courses").select("id,title").eq("id", last).eq("is_published", true).maybeSingle();
        if (alive && data) setLastCourse(data);
      }
    })().catch(() => { /* the tiles do not depend on this data */ });
    return () => { alive = false; };
  }, [user, canBooking, canTasks]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }
  if (!user) return <Navigate to="/auth?redirect=/home" replace />;

  const canFinance = isAdmin || financeOn;
  const name = (profile?.full_name || "").split(" ")[0];

  const items: Item[] = [
    { key: "courses", icon: "📚", title: "קורסים", sub: "ללמוד ולהתקדם", href: "/courses" },
    canClients
      ? { key: "clients", icon: "👥", title: "מטופלים", sub: "הרשימה והתיקים", href: "/crm" }
      : { key: "clients", icon: "👥", title: "מטופלים", sub: "ניהול מטופלים", href: "/pricing", lockedTier: "שדרוג" },
    canBooking
      ? { key: "booking", icon: "📅", title: "תורים", sub: "היומן והזמנות", href: "/carlos-dashboard/#booking-mgmt", external: true }
      : { key: "booking", icon: "📅", title: "תורים", sub: "זימון תורים", href: "/pricing", lockedTier: "שדרוג" },
    canTasks
      ? { key: "tasks", icon: "⏰", title: "תזכורות", sub: "משימות ותזכורות", href: "/carlos-dashboard/#tasks", external: true }
      : { key: "tasks", icon: "⏰", title: "תזכורות", sub: "משימות ותזכורות", href: "/pricing", lockedTier: "שדרוג" },
    // finance is a personal switch, not part of a plan, so when it is off it is simply not shown
    ...(canFinance ? [{ key: "finance", icon: "💰", title: "כספים", sub: "הכנסות והוצאות", href: "/carlos-dashboard/#finance", external: true }] : []),
    { key: "board", icon: "🪑", title: "לוח יד שנייה", sub: "ציוד למטפלים", href: "/board" },
  ];

  // what the plan opens comes first; what it does not open is one small line at the bottom
  const open = items.filter((it) => !it.lockedTier);
  const locked = items.filter((it) => it.lockedTier);

  const lockedRow = locked.length > 0 && (
    <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <Lock size={14} className="text-amber-600" />
      <span>לא כלול בתכנית שלך:</span>
      {locked.map((it) => <span key={it.key}>{it.icon} {it.title}</span>)}
      <Link to="/pricing" className="text-primary font-semibold">מה כלול בכל תכנית</Link>
    </p>
  );

  const todayPanels = (
    <div className="grid md:grid-cols-[1.5fr_1fr] gap-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="font-bold mb-2">התורים להיום</h2>
        {!canBooking ? (
          <p className="text-sm text-muted-foreground">זימון תורים לא כלול בתכנית שלך. <Link className="text-primary font-semibold" to="/pricing">לתכניות</Link></p>
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
          {canTasks && <a className="text-sm text-primary font-semibold" href="/carlos-dashboard/#tasks">הכול</a>}
        </h2>
        {!canTasks ? (
          <p className="text-sm text-muted-foreground">תזכורות ומשימות לא כלולות בתכנית שלך.</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין משימות פתוחות.</p>
        ) : (
          tasks.map((t) => <div key={t.id} className="py-2 border-t first:border-t-0">{t.title}</div>)
        )}
      </section>
    </div>
  );

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

        <Link
          to={lastCourse ? `/course/${lastCourse.id}` : "/my-courses"}
          className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 hover:border-primary"
        >
          <span className="text-2xl">📚</span>
          <span className="min-w-0">
            <b className="block">{lastCourse ? "להמשיך ללמוד" : "הקורסים שלי"}</b>
            <span className="text-sm text-muted-foreground truncate block">
              {lastCourse ? lastCourse.title : "הקורסים שפתוחים לך וההתקדמות בהם"}
            </span>
          </span>
          <span className="mr-auto text-primary font-semibold text-sm">←</span>
        </Link>

        {view === "tiles" && (
          <div data-area="K32" className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {open.map((it) => go(it, tileCls(it), tileBody(it)))}
          </div>
        )}
        {view === "tiles" && lockedRow}

        {view === "day" && (
          <div data-area="K33">
            {todayPanels}
            <div className="flex flex-wrap gap-3 mt-4">
              {open.map((it) =>
                go(it, "flex-1 basis-40 rounded-xl border px-4 py-2.5 font-semibold flex gap-2 items-center bg-card hover:border-primary", (
                  <><span>{it.icon}</span>{it.title}</>
                ))
              )}
            </div>
            {lockedRow}
          </div>
        )}

        {view === "side" && (
          <div data-area="K34" className="grid md:grid-cols-[14rem_1fr] gap-4">
            <nav className="rounded-2xl border bg-card p-3 flex md:flex-col gap-1 overflow-x-auto">
              {open.map((it) =>
                go(it, "flex gap-2 items-center px-3 py-2 rounded-lg whitespace-nowrap font-semibold hover:bg-muted", (
                  <><span>{it.icon}</span>{it.title}</>
                ))
              )}
            </nav>
            <div className="space-y-4 min-w-0">
              {todayPanels}
              {lockedRow}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Home;
