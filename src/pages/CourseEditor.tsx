import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, CourseCategory, SubscriptionTier } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CATEGORY_OPTIONS, TIER_OPTIONS, TIER_LABELS, RESOURCE_TYPE_LABELS } from "@/lib/constants";
import {
  MAX_FILE_BYTES,
  type Lesson,
  type Section,
  extOf,
  isVideoLink,
  kindOfFile,
  lessonsOf,
  moveLesson,
  titleFromFileName,
} from "@/lib/courseEditor";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  Eye,
  FolderPlus,
  GripVertical,
  ImagePlus,
  Link2,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";

type Course = Database["public"]["Tables"]["courses"]["Row"];

const BUCKET = "course-files";
const COVERS = "course-covers";
// course_sections and course_resources.section_id are newer than the generated types
const db = supabase as unknown as SupabaseClient;

interface UploadItem {
  key: string;
  name: string;
  sectionId: string | null;
  error?: string;
}

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const CourseEditor = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [sectionsReady, setSectionsReady] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [savedAt, setSavedAt] = useState(0);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragLesson, setDragLesson] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null); // section id, or "none"
  const [previewTier, setPreviewTier] = useState<SubscriptionTier>("free");
  const [coverBusy, setCoverBusy] = useState(false);
  const filePick = useRef<HTMLInputElement>(null);
  const coverPick = useRef<HTMLInputElement>(null);
  const pickFor = useRef<string | null>(null);

  const flashSaved = () => setSavedAt(Date.now());
  const fail = (title: string, description?: string) => toast({ title, description, variant: "destructive" });

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const [c, r, s] = await Promise.all([
      db.from("courses").select("*").eq("id", id).maybeSingle(),
      db.from("course_resources").select("*").eq("course_id", id).order("order_index", { ascending: true }),
      db.from("course_sections").select("*").eq("course_id", id).order("order_index", { ascending: true }),
    ]);
    setCourse((c.data as Course) ?? null);
    setLessons(((r.data as Lesson[]) ?? []).map((l) => ({ ...l, section_id: l.section_id ?? null })));
    setSectionsReady(!s.error);
    setSections(s.error ? [] : ((s.data as Section[]) ?? []));
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // ---------- the course itself ----------
  const saveCourse = async (patch: Partial<Course>) => {
    if (!course) return;
    const before = course;
    setCourse({ ...course, ...patch });
    const { error } = await db.from("courses").update(patch).eq("id", course.id);
    if (error) {
      setCourse(before);
      fail("השמירה נכשלה", error.message);
      return;
    }
    flashSaved();
  };

  const uploadCover = async (file: File | undefined) => {
    if (!file || !course) return;
    if (!file.type.startsWith("image/")) return fail("זה לא קובץ תמונה");
    setCoverBusy(true);
    const path = `${course.id}/${crypto.randomUUID()}.${extOf(file.name) || "jpg"}`;
    const { error } = await supabase.storage.from(COVERS).upload(path, file, { upsert: false });
    setCoverBusy(false);
    if (error) {
      return fail(
        "העלאת התמונה נכשלה",
        /bucket/i.test(error.message)
          ? "צריך להריץ פעם אחת את קובץ ה-SQL של הפרקים והתמונות ב-Supabase. בינתיים אפשר להדביק קישור לתמונה."
          : error.message,
      );
    }
    await saveCourse({ thumbnail_url: supabase.storage.from(COVERS).getPublicUrl(path).data.publicUrl });
  };

  // ---------- lessons ----------
  const sectionName = (sectionId: string | null) =>
    sectionId ? sections.find((s) => s.id === sectionId)?.title || "פרק" : sections.length ? "ללא פרק" : "הקורס";

  const insertLesson = async (row: Record<string, unknown>, sectionId: string | null) => {
    const payload = {
      course_id: course!.id,
      min_tier: course!.min_tier,
      is_published: false,
      ...row,
      ...(sectionsReady ? { section_id: sectionId } : {}),
    };
    const { data, error } = await db.from("course_resources").insert(payload).select().single();
    if (error || !data) return { error: error?.message || "לא נשמר" };
    const lesson = { ...(data as Lesson), section_id: (data as Lesson).section_id ?? null };
    setLessons((prev) => [...prev, lesson]);
    return { lesson };
  };

  const addFiles = async (files: File[], sectionId: string | null) => {
    if (!course || !files.length) return;
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = files.filter((f) => f.size <= MAX_FILE_BYTES);
    if (tooBig.length) {
      fail(
        `${tooBig.length === 1 ? "קובץ אחד גדול" : tooBig.length + " קבצים גדולים"} מ-50MB ולא הועלו`,
        `${tooBig.map((f) => f.name).join(", ")}. לסרטון גדול: להעלות ל-YouTube או Vimeo ולהדביק כאן את הקישור.`,
      );
    }
    const items: UploadItem[] = ok.map((f) => ({ key: crypto.randomUUID(), name: f.name, sectionId }));
    setUploads((prev) => [...prev, ...items]);
    let order = lessonsOf(lessons, sectionId).length;
    let added = 0;
    for (let i = 0; i < ok.length; i++) {
      const file = ok[i];
      const item = items[i];
      const ext = extOf(file.name);
      const path = `${course.id}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      let problem = up.error?.message;
      if (!problem) {
        const res = await insertLesson(
          { title: titleFromFileName(file.name), type: kindOfFile(file.name), file_path: path, file_name: file.name, order_index: order },
          sectionId,
        );
        if (res.error) {
          problem = res.error;
          await supabase.storage.from(BUCKET).remove([path]);
        } else {
          order++;
          added++;
        }
      }
      setUploads((prev) =>
        problem ? prev.map((u) => (u.key === item.key ? { ...u, error: problem } : u)) : prev.filter((u) => u.key !== item.key),
      );
    }
    if (added) {
      flashSaved();
      toast({
        title: `${added === 1 ? "קובץ אחד נוסף" : added + " קבצים נוספו"} אל: ${sectionName(sectionId)}`,
        description: "הם בטיוטה עד שמדליקים \"מפורסם\".",
      });
    }
  };

  const addLink = async (raw: string, sectionId: string | null) => {
    const url = raw.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) return fail("זה לא נראה כמו קישור", "הקישור צריך להתחיל ב-https://");
    const video = isVideoLink(url);
    const res = await insertLesson(
      { title: video ? "סרטון חדש" : "קישור חדש", type: video ? "video" : "other", url, order_index: lessonsOf(lessons, sectionId).length },
      sectionId,
    );
    if (res.error) return fail("הקישור לא נשמר", res.error);
    flashSaved();
    toast({ title: `${video ? "הסרטון" : "הקישור"} נוסף אל: ${sectionName(sectionId)}`, description: "כדאי לתת לו שם." });
    return true;
  };

  const updateLesson = async (lessonId: string, patch: Partial<Lesson>) => {
    const before = lessons;
    setLessons((prev) => prev.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)));
    const { error } = await db.from("course_resources").update(patch).eq("id", lessonId);
    if (error) {
      setLessons(before);
      return fail("השמירה נכשלה", error.message);
    }
    flashSaved();
  };

  const deleteLesson = async (lesson: Lesson) => {
    if (!confirm(`למחוק את "${lesson.title}"? ${lesson.file_path ? "הקובץ יימחק גם הוא." : ""}`)) return;
    const { error } = await db.from("course_resources").delete().eq("id", lesson.id);
    if (error) return fail("המחיקה נכשלה", error.message);
    if (lesson.file_path) await supabase.storage.from(BUCKET).remove([lesson.file_path]);
    setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
    flashSaved();
  };

  const place = async (lessonId: string, toSection: string | null, toIndex: number) => {
    const before = lessons;
    const { next, changed } = moveLesson(lessons, lessonId, toSection, toIndex);
    if (!changed.length) return;
    setLessons(next);
    const results = await Promise.all(
      changed.map((l) =>
        db
          .from("course_resources")
          .update({ order_index: l.order_index, ...(sectionsReady ? { section_id: l.section_id } : {}) })
          .eq("id", l.id),
      ),
    );
    const bad = results.find((r) => r.error);
    if (bad?.error) {
      setLessons(before);
      return fail("הסדר לא נשמר", bad.error.message);
    }
    flashSaved();
  };

  const publishEverything = async () => {
    if (!course) return;
    const { error } = await db.from("course_resources").update({ is_published: true }).eq("course_id", course.id);
    if (error) return fail("הפרסום נכשל", error.message);
    setLessons((prev) => prev.map((l) => ({ ...l, is_published: true })));
    if (!course.is_published) await saveCourse({ is_published: true });
    else flashSaved();
    toast({ title: "הקורס וכל השיעורים מפורסמים" });
  };

  // ---------- chapters ----------
  const addSection = async () => {
    if (!course) return;
    const { data, error } = await db
      .from("course_sections")
      .insert({ course_id: course.id, title: `פרק ${sections.length + 1}`, order_index: sections.length })
      .select()
      .single();
    if (error || !data) return fail("הפרק לא נוצר", error?.message);
    setSections((prev) => [...prev, data as Section]);
    flashSaved();
  };

  const renameSection = async (section: Section, title: string) => {
    const clean = title.trim();
    if (!clean || clean === section.title) return;
    setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, title: clean } : s)));
    const { error } = await db.from("course_sections").update({ title: clean }).eq("id", section.id);
    if (error) return fail("השם לא נשמר", error.message);
    flashSaved();
  };

  const shiftSection = async (index: number, by: number) => {
    const other = index + by;
    if (other < 0 || other >= sections.length) return;
    const next = [...sections];
    [next[index], next[other]] = [next[other], next[index]];
    const renumbered = next.map((s, i) => ({ ...s, order_index: i }));
    setSections(renumbered);
    const results = await Promise.all(
      [renumbered[index], renumbered[other]].map((s) =>
        db.from("course_sections").update({ order_index: s.order_index }).eq("id", s.id),
      ),
    );
    if (results.some((r) => r.error)) return fail("סדר הפרקים לא נשמר");
    flashSaved();
  };

  const deleteSection = async (section: Section) => {
    const inside = lessonsOf(lessons, section.id).length;
    if (
      !confirm(
        `למחוק את הפרק "${section.title}"?` +
          (inside ? ` ${inside} השיעורים שבו לא יימחקו. הם יעברו ל"ללא פרק".` : ""),
      )
    )
      return;
    const { error } = await db.from("course_sections").delete().eq("id", section.id);
    if (error) return fail("הפרק לא נמחק", error.message);
    setSections((prev) => prev.filter((s) => s.id !== section.id));
    setLessons((prev) => {
      const loose = lessonsOf(prev, null).length;
      const moved = lessonsOf(prev, section.id);
      return prev.map((l) => {
        const at = moved.findIndex((m) => m.id === l.id);
        return at < 0 ? l : { ...l, section_id: null, order_index: loose + at };
      });
    });
    flashSaved();
  };

  // ---------- guards ----------
  if (authLoading || (isAdmin && isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin || !course) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-20 max-w-md mx-auto text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {user && isAdmin ? "הקורס לא נמצא" : "אין הרשאת גישה"}
          </h1>
          <p className="text-muted-foreground mb-6">
            {user && isAdmin ? "ייתכן שהקורס נמחק." : "עריכת קורסים פתוחה למנהל האתר בלבד."}
          </p>
          <Button asChild>
            <Link to={user && isAdmin ? "/admin" : "/"}>{user && isAdmin ? "לכל הקורסים" : "חזרה לדף הבית"}</Link>
          </Button>
        </main>
      </div>
    );
  }

  const published = lessons.filter((l) => l.is_published).length;
  const draggingFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  // One block of lessons: a chapter, or the lessons that have no chapter.
  const block = (section: Section | null, index: number) => {
    const sectionId = section?.id ?? null;
    const zone = sectionId ?? "none";
    const rows = lessonsOf(lessons, sectionId);
    const waiting = uploads.filter((u) => u.sectionId === sectionId);
    const label = section ? `פרק ${index + 1}: ${section.title}` : sections.length ? "ללא פרק" : "השיעורים";
    const hot = overZone === zone;

    return (
      <Card
        key={zone}
        className={`p-4 transition-colors ${hot ? "border-primary ring-2 ring-primary/40 bg-primary/5" : ""}`}
        onDragOver={(e) => {
          if (!draggingFiles(e) && !dragLesson) return;
          e.preventDefault();
          if (overZone !== zone) setOverZone(zone);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverZone(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOverZone(null);
          setOverRow(null);
          if (draggingFiles(e)) addFiles(Array.from(e.dataTransfer.files), sectionId);
          else if (dragLesson) place(dragLesson, sectionId, rows.length);
          setDragLesson(null);
        }}
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {section ? (
            <>
              <Badge className="shrink-0">פרק {index + 1}</Badge>
              <Input
                key={section.id + section.title}
                defaultValue={section.title}
                aria-label="שם הפרק"
                className="h-9 flex-1 min-w-[10rem] font-semibold"
                onBlur={(e) => renameSection(section, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
              <Button variant="ghost" size="icon" aria-label="להעלות את הפרק" disabled={index === 0} onClick={() => shiftSection(index, -1)}>
                <ArrowUp size={16} />
              </Button>
              <Button variant="ghost" size="icon" aria-label="להוריד את הפרק" disabled={index === sections.length - 1} onClick={() => shiftSection(index, 1)}>
                <ArrowDown size={16} />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive" aria-label="מחיקת הפרק" onClick={() => deleteSection(section)}>
                <Trash2 size={16} />
              </Button>
            </>
          ) : (
            <h2 className="font-semibold text-foreground flex-1">{label}</h2>
          )}
          <span className="text-sm text-muted-foreground">
            {rows.length} שיעורים
          </span>
        </div>

        {rows.length === 0 && waiting.length === 0 && (
          <p className="text-sm text-muted-foreground mb-3">עדיין אין כאן שיעורים.</p>
        )}

        <ul className="space-y-2">
          {rows.map((lesson, i) => (
            <li
              key={lesson.id}
              draggable
              onDragStart={(e) => {
                setDragLesson(lesson.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", lesson.id);
              }}
              onDragEnd={() => {
                setDragLesson(null);
                setOverRow(null);
                setOverZone(null);
              }}
              onDragOver={(e) => {
                if (!dragLesson || dragLesson === lesson.id) return;
                e.preventDefault();
                e.stopPropagation();
                if (overRow !== lesson.id) setOverRow(lesson.id);
                if (overZone !== zone) setOverZone(zone);
              }}
              onDrop={(e) => {
                if (!dragLesson) return;
                e.preventDefault();
                e.stopPropagation();
                place(dragLesson, sectionId, i);
                setDragLesson(null);
                setOverRow(null);
                setOverZone(null);
              }}
              className={`flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 ${
                overRow === lesson.id ? "border-primary ring-2 ring-primary/40" : "border-border"
              } ${dragLesson === lesson.id ? "opacity-40" : ""}`}
            >
              <GripVertical size={18} className="text-muted-foreground cursor-grab shrink-0" aria-hidden />
              <span className="text-sm font-semibold text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-[12rem]">
                <Input
                  key={lesson.id + lesson.title}
                  defaultValue={lesson.title}
                  aria-label="שם השיעור"
                  className="h-8 border-transparent hover:border-input font-medium px-2"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== lesson.title) updateLesson(lesson.id, { title: v });
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <p className="text-xs text-muted-foreground truncate px-2" dir="auto">
                  {lesson.file_name || lesson.url || ""}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">{RESOURCE_TYPE_LABELS[lesson.type]}</Badge>
              <select
                aria-label="נפתח מדרגה"
                className={selectClass}
                value={lesson.min_tier}
                onChange={(e) => updateLesson(lesson.id, { min_tier: e.target.value as SubscriptionTier })}
              >
                {TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {sections.length > 0 && (
                <select
                  aria-label="באיזה פרק"
                  className={selectClass + " max-w-[9rem]"}
                  value={sectionId ?? ""}
                  onChange={(e) => place(lesson.id, e.target.value || null, lessonsOf(lessons, e.target.value || null).length)}
                >
                  <option value="">ללא פרק</option>
                  {sections.map((s, n) => (
                    <option key={s.id} value={s.id}>פרק {n + 1}: {s.title}</option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 text-sm shrink-0 cursor-pointer">
                <Switch
                  checked={!!lesson.is_published}
                  onCheckedChange={(v) => updateLesson(lesson.id, { is_published: v })}
                  aria-label="מפורסם"
                />
                <span className={lesson.is_published ? "text-primary font-semibold" : "text-muted-foreground"}>
                  {lesson.is_published ? "מפורסם" : "טיוטה"}
                </span>
              </label>
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="להעלות שיעור" disabled={i === 0} onClick={() => place(lesson.id, sectionId, i - 1)}>
                  <ArrowUp size={15} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="להוריד שיעור" disabled={i === rows.length - 1} onClick={() => place(lesson.id, sectionId, i + 1)}>
                  <ArrowDown size={15} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="מחיקת השיעור" onClick={() => deleteLesson(lesson)}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </li>
          ))}
          {waiting.map((u) => (
            <li key={u.key} className="flex items-center gap-3 rounded-lg border border-dashed border-border p-2 text-sm">
              {u.error ? <ShieldAlert size={16} className="text-destructive shrink-0" /> : <Loader2 size={16} className="animate-spin text-primary shrink-0" />}
              <span className="truncate flex-1" dir="auto">{u.name}</span>
              {u.error ? (
                <>
                  <span className="text-destructive">לא עלה: {u.error}</span>
                  <Button variant="ghost" size="sm" onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}>הסר</Button>
                </>
              ) : (
                <span className="text-muted-foreground">עולה…</span>
              )}
            </li>
          ))}
        </ul>

        {/* where new material for THIS chapter goes */}
        <div className={`mt-3 rounded-lg border-2 border-dashed p-3 ${hot ? "border-primary" : "border-primary/40"} bg-accent/40`}>
          <p className="text-sm font-semibold text-accent-foreground mb-2">
            {hot ? "משחררים כאן, וזה נכנס אל: " : "להוסיף אל: "}
            <span className="underline underline-offset-4">{label}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                pickFor.current = sectionId;
                filePick.current?.click();
              }}
            >
              <Upload size={15} />
              בחירת קבצים
            </Button>
            <span className="text-xs text-muted-foreground">או לגרור לכאן קבצים, כמה שרוצים (עד 50MB לקובץ)</span>
            <form
              className="flex items-center gap-2 flex-1 min-w-[15rem]"
              onSubmit={async (e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem("link") as HTMLInputElement;
                if (await addLink(input.value, sectionId)) input.value = "";
              }}
            >
              <Input name="link" dir="ltr" placeholder="או קישור YouTube / Vimeo" aria-label={`קישור לסרטון עבור ${label}`} className="h-9" />
              <Button type="submit" variant="outline" size="sm" className="gap-1 shrink-0">
                <Link2 size={15} />
                הוסף
              </Button>
            </form>
          </div>
        </div>
      </Card>
    );
  };

  const loose = lessonsOf(lessons, null);
  const showLoose = sections.length === 0 || loose.length > 0 || uploads.some((u) => u.sectionId === null);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* what state the course is in, always visible */}
      <div className="sticky top-16 md:top-20 z-40 bg-card/95 backdrop-blur-sm border-b border-border" data-area="K4">
        <div className="container py-3 flex flex-wrap items-center gap-3">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
            <ArrowRight size={16} />
            כל הקורסים
          </Link>
          <h1 className="text-lg font-bold text-foreground flex-1 min-w-[8rem] truncate">{course.title}</h1>
          <span className="text-sm text-muted-foreground">
            <span className={course.is_published ? "text-primary font-semibold" : "font-semibold"}>
              {course.is_published ? "הקורס מפורסם" : "הקורס בטיוטה"}
            </span>
            {" · "}
            {published} מתוך {lessons.length} שיעורים גלויים
          </span>
          {Date.now() - savedAt < 4000 && (
            <span className="text-sm text-primary inline-flex items-center gap-1" role="status">
              <Check size={15} />
              נשמר
            </span>
          )}
          <div className="flex items-center gap-1">
            <select aria-label="תצוגה כדרגה" className={selectClass} value={previewTier} onChange={(e) => setPreviewTier(e.target.value as SubscriptionTier)}>
              {TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" className="gap-1" asChild>
              <a href={`/course/${course.id}?as=${previewTier}`} target="_blank" rel="noreferrer">
                <Eye size={15} />
                הצג כמו {TIER_LABELS[previewTier]}
              </a>
            </Button>
          </div>
          <Button size="sm" onClick={publishEverything}>פרסם הכול</Button>
        </div>
      </div>

      <main className="container py-6 grid gap-6 lg:grid-cols-[320px_1fr] items-start">
        {/* course details */}
        <Card className="p-4 space-y-4">
          <h2 className="font-semibold text-foreground">פרטי הקורס</h2>
          <div className="space-y-2">
            <Label htmlFor="c_title">שם הקורס</Label>
            <Input
              id="c_title"
              key={"t" + course.id}
              defaultValue={course.title}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== course.title) saveCourse({ title: v });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c_desc">תיאור קצר</Label>
            <Textarea
              id="c_desc"
              key={"d" + course.id}
              rows={3}
              defaultValue={course.description ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (course.description ?? null)) saveCourse({ description: v });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="c_cat">תחום</Label>
              <select id="c_cat" className={selectClass + " w-full"} value={course.category} onChange={(e) => saveCourse({ category: e.target.value as CourseCategory })}>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c_tier">נפתח מדרגה</Label>
              <select id="c_tier" className={selectClass + " w-full"} value={course.min_tier} onChange={(e) => saveCourse({ min_tier: e.target.value as SubscriptionTier })}>
                {TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>תמונת הקורס</Label>
            <button
              type="button"
              onClick={() => coverPick.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadCover(e.dataTransfer.files[0]);
              }}
              className="w-full h-36 rounded-lg border-2 border-dashed border-border bg-muted bg-cover bg-center flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={course.thumbnail_url ? { backgroundImage: `url(${course.thumbnail_url})` } : undefined}
              aria-label="העלאת תמונה לקורס"
            >
              {coverBusy ? (
                <Loader2 className="animate-spin" size={20} />
              ) : course.thumbnail_url ? (
                <span className="bg-background/85 rounded px-2 py-1 text-foreground">החלפת התמונה</span>
              ) : (
                <>
                  <ImagePlus size={22} />
                  לחיצה או גרירה של תמונה
                </>
              )}
            </button>
            <input ref={coverPick} type="file" accept="image/*" hidden onChange={(e) => { uploadCover(e.target.files?.[0]); e.target.value = ""; }} />
            <Input
              dir="ltr"
              key={"u" + (course.thumbnail_url ?? "")}
              defaultValue={course.thumbnail_url ?? ""}
              placeholder="או קישור לתמונה: https://..."
              aria-label="קישור לתמונת הקורס"
              className="h-9 text-xs"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (course.thumbnail_url ?? null)) saveCourse({ thumbnail_url: v });
              }}
            />
          </div>
          <label className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer">
            <span>
              <span className="font-medium block">הקורס מפורסם</span>
              <span className="text-sm text-muted-foreground">כבוי = רק את רואה אותו</span>
            </span>
            <Switch checked={!!course.is_published} onCheckedChange={(v) => saveCourse({ is_published: v })} aria-label="הקורס מפורסם" />
          </label>
          <p className="text-xs text-muted-foreground">כל שינוי נשמר לבד. אין כפתור "שמור".</p>
        </Card>

        {/* chapters and lessons */}
        <div className="space-y-4" data-area="K5">
          {!sectionsReady && (
            <Card className="p-3 text-sm bg-secondary/40">
              חלוקה לפרקים תיפתח אחרי שמריצים פעם אחת את קובץ ה-SQL של הפרקים ב-Supabase. עד אז כל השיעורים ברשימה אחת.
            </Card>
          )}
          {sections.map((s, i) => block(s, i))}
          {showLoose && block(null, -1)}
          {sectionsReady && (
            <Button variant="outline" className="gap-2 w-full border-dashed" onClick={addSection}>
              <FolderPlus size={17} />
              פרק חדש
            </Button>
          )}
        </div>
      </main>

      <input
        ref={filePick}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []), pickFor.current);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default CourseEditor;
