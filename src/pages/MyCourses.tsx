import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Loader2, PlayCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CATEGORY_LABELS } from "@/lib/constants";
import { loadProgress, type ProgressRow } from "@/lib/progress";
import type { CourseCategory, SubscriptionTier } from "@/integrations/supabase/types";

// "הקורסים שלי" (M15): the courses I started, how far I got and where to continue; below them the courses
// my plan opens that I have not started yet.

interface CourseRow { id: string; title: string; description: string | null; category: CourseCategory; min_tier: SubscriptionTier; order_index: number }
interface LessonRow { id: string; course_id: string; min_tier: SubscriptionTier }

const MyCourses = () => {
  const { user, isLoading: authLoading, canAccessTier, isAdmin } = useAuth();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [c, l, p] = await Promise.all([
        supabase.from("courses").select("id,title,description,category,min_tier,order_index").eq("is_published", true).order("order_index"),
        supabase.from("course_resources").select("id,course_id,min_tier").eq("is_published", true),
        loadProgress(user.id),
      ]);
      setCourses((c.data as CourseRow[]) ?? []);
      setLessons((l.data as LessonRow[]) ?? []);
      setProgress(p);
      setLoading(false);
    })();
  }, [user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth?redirect=/my-courses" replace />;

  const can = (t: SubscriptionTier) => isAdmin || canAccessTier(t);
  const open = courses.filter((c) => can(c.min_tier));
  const seen = new Set((progress ?? []).map((p) => p.resource_id));
  const lastAt = new Map<string, string>();
  (progress ?? []).forEach((p) => { if (!lastAt.has(p.course_id)) lastAt.set(p.course_id, p.viewed_at); });

  const stats = (c: CourseRow) => {
    const mine = lessons.filter((l) => l.course_id === c.id && can(l.min_tier));
    const done = mine.filter((l) => seen.has(l.id)).length;
    return { total: mine.length, done, percent: mine.length ? Math.round((done / mine.length) * 100) : 0 };
  };

  const started = open
    .filter((c) => lastAt.has(c.id))
    .sort((a, b) => (lastAt.get(b.id)! > lastAt.get(a.id)! ? 1 : -1));
  const notStarted = open.filter((c) => !lastAt.has(c.id));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8 max-w-4xl" data-area="K35">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">הקורסים שלי</h1>
        <p className="text-muted-foreground mb-6">מה התחלת, כמה התקדמת, ומה עוד פתוח לך.</p>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {progress === null ? null : started.length > 0 ? (
              <section className="mb-10 space-y-3">
                <h2 className="text-lg font-bold">להמשיך ללמוד</h2>
                {started.map((c) => {
                  const s = stats(c);
                  return (
                    <Card key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <b className="text-lg">{c.title}</b>
                          <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[c.category]}</span>
                        </div>
                        <Progress value={s.percent} aria-label={`התקדמות ב${c.title}`} />
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {s.done === s.total && s.total > 0 ? "סיימת את הקורס 🎉" : `${s.done} מתוך ${s.total} שיעורים`}
                        </p>
                      </div>
                      <Button asChild className="gap-1 shrink-0">
                        <Link to={`/course/${c.id}`}><PlayCircle size={16} />{s.done === s.total && s.total > 0 ? "לצפות שוב" : "להמשיך"}</Link>
                      </Button>
                    </Card>
                  );
                })}
              </section>
            ) : (
              <Card className="p-6 mb-10 text-center text-muted-foreground">
                עוד לא התחלת קורס. בחרו קורס מהרשימה למטה, והוא יופיע כאן עם ההתקדמות שלך.
              </Card>
            )}

            <section className="space-y-3">
              <h2 className="text-lg font-bold">{started.length > 0 ? "עוד קורסים שפתוחים לך" : "הקורסים שפתוחים לך"}</h2>
              {notStarted.length === 0 ? (
                <p className="text-muted-foreground">
                  {open.length === 0 ? "אין כרגע קורסים שפתוחים לתכנית שלך." : "התחלת את כל הקורסים שפתוחים לך."}{" "}
                  <Link to="/courses" className="text-primary font-semibold">לכל הקורסים</Link>
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {notStarted.map((c) => (
                    <Link key={c.id} to={`/course/${c.id}`} className="block rounded-xl border bg-card p-4 hover:border-primary">
                      <b>{c.title}</b>
                      <div className="text-xs text-muted-foreground mb-1">{CATEGORY_LABELS[c.category]}</div>
                      {c.description && <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
                    </Link>
                  ))}
                </div>
              )}
              {open.length < courses.length && (
                <p className="text-sm text-muted-foreground pt-2">
                  יש עוד קורסים בתכניות אחרות. <Link to="/pricing" className="text-primary font-semibold">מה כלול בכל תכנית</Link>
                </p>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default MyCourses;
