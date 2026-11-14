import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, SubscriptionTier } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { loadProgress, markViewed, resumeFrom, type ProgressRow } from "@/lib/progress";
import { CATEGORY_LABELS, TIER_LABELS, RESOURCE_TYPE_LABELS } from "@/lib/constants";
import {
  Loader2,
  Lock,
  Play,
  FileText,
  Download,
  Clock,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

type Course = Database["public"]["Tables"]["courses"]["Row"];
type Resource = Database["public"]["Tables"]["course_resources"]["Row"] & { section_id?: string | null };
interface Section {
  id: string;
  title: string;
  order_index: number;
}

const BUCKET = "course-files";
const TIER_ORDER: SubscriptionTier[] = ["free", "basic", "premium", "vip"];
// course_sections is newer than the generated types
const db = supabase as unknown as SupabaseClient;

const VIDEO_FILE_RE = /\.(mp4|webm|mov|m4v|ogg)$/i;

// A resource counts as a video if it's typed as one, points at a known video
// host, or is an uploaded video file. Videos play inline; everything else
// downloads / opens.
const isVideoResource = (r: Resource): boolean =>
  r.type === "video" ||
  (!!r.url && /(youtube\.com|youtu\.be|vimeo\.com)/i.test(r.url)) ||
  (!!r.file_name && VIDEO_FILE_RE.test(r.file_name));

// Build an embeddable source from a video URL (YouTube / Vimeo / direct file).
const getVideoEmbed = (url: string): { type: "iframe" | "file"; src: string } => {
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (yt) return { type: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { type: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };

  return { type: "file", src: url };
};

const CoursePage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, canAccessTier: canAccessOwnTier } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // "?as=basic": the admin looks at the course the way that tier sees it (from the course editor)
  const asParam = searchParams.get("as") as SubscriptionTier | null;
  const previewTier = isAdmin && asParam && TIER_ORDER.includes(asParam) ? asParam : null;
  const canAccessTier = (required: SubscriptionTier) =>
    previewTier ? TIER_ORDER.indexOf(previewTier) >= TIER_ORDER.indexOf(required) : canAccessOwnTier(required);

  const [course, setCourse] = useState<Course | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeVideoSrc, setActiveVideoSrc] = useState<
    { type: "iframe" | "file"; src: string } | null
  >(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // lessons this user already opened; null = not tracked (guest, admin preview, or the table is not there yet)
  const [progress, setProgress] = useState<ProgressRow[] | null>(null);
  const [resumedFrom, setResumedFrom] = useState<string | null>(null);
  const tracking = !!user && !previewTier && progress !== null;

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setIsLoading(true);
      let courseQuery = supabase.from("courses").select("*").eq("id", id);
      // in a preview the admin may look at a course that is still a draft
      if (!previewTier) courseQuery = courseQuery.eq("is_published", true);
      const [{ data: courseData }, { data: resourceData }, sectionResult, prog] = await Promise.all([
        courseQuery.maybeSingle(),
        supabase
          .from("course_resources")
          .select("*")
          .eq("course_id", id)
          .eq("is_published", true)
          .order("order_index", { ascending: true }),
        db.from("course_sections").select("id,title,order_index").eq("course_id", id).order("order_index", { ascending: true }),
        user && !previewTier ? loadProgress(user.id, id) : Promise.resolve(null),
      ]);
      setProgress(prog);

      setCourse(courseData ?? null);
      // a site without the chapters table yet simply shows one list
      const secs = sectionResult.error ? [] : ((sectionResult.data as Section[]) ?? []);
      setSections(secs);
      const rank = new Map(secs.map((s, i) => [s.id, i]));
      const res = ((resourceData ?? []) as Resource[]).slice().sort((a, b) => {
        const ra = a.section_id && rank.has(a.section_id) ? rank.get(a.section_id)! : secs.length;
        const rb = b.section_id && rank.has(b.section_id) ? rank.get(b.section_id)! : secs.length;
        return ra - rb || (a.order_index ?? 0) - (b.order_index ?? 0);
      });
      setResources(res);

      const playable = res.filter((r) => isVideoResource(r) && canAccessTier(r.min_tier));
      // back to a course: continue from where this user stopped
      const resume = prog ? resumeFrom(playable, prog) : null;
      setResumedFrom(resume ? resume.title : null);
      setActiveVideoId((resume ?? playable[0])?.id ?? null);
      setIsLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, previewTier]);

  // Resolve the playable source for the active video (URL embed or signed file URL)
  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const v = resources.find((r) => r.id === activeVideoId);
      if (!v || !canAccessTier(v.min_tier)) {
        setActiveVideoSrc(null);
        return;
      }
      if (v.url) {
        if (!cancelled) setActiveVideoSrc(getVideoEmbed(v.url));
        return;
      }
      if (v.file_path) {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(v.file_path, 3600);
        if (!cancelled)
          setActiveVideoSrc(data ? { type: "file", src: data.signedUrl } : null);
        return;
      }
      if (!cancelled) setActiveVideoSrc(null);
    };
    resolve();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideoId, resources]);

  const viewed = new Set((progress ?? []).map((p) => p.resource_id));
  const noteViewed = (resource: Resource) => {
    if (!user || previewTier || progress === null || !id || viewed.has(resource.id)) return;
    setProgress((p) => [{ resource_id: resource.id, course_id: id, viewed_at: new Date().toISOString() }, ...(p ?? [])]);
    markViewed(user.id, id, resource.id);
  };
  const play = (resource: Resource) => {
    setActiveVideoId(resource.id);
    setResumedFrom(null);
    noteViewed(resource);
  };

  // Open / download a non-video resource (signed URL for files, direct for links)
  const handleOpen = async (resource: Resource) => {
    noteViewed(resource);
    if (resource.url && !resource.file_path) {
      window.open(resource.url, "_blank");
      return;
    }
    if (!resource.file_path) return;
    setDownloadingId(resource.id);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(resource.file_path, 60);
    setDownloadingId(null);

    if (error || !data) {
      toast({ title: "ההורדה נכשלה", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-20 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">הקורס לא נמצא</h1>
          <p className="text-muted-foreground mb-6">
            ייתכן שהקורס אינו קיים או שאינו מפורסם.
          </p>
          <Button asChild>
            <Link to="/courses">לכל הקורסים</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const videoResources = resources.filter(isVideoResource);
  const hasAnyUnlockedVideo = videoResources.some((v) => canAccessTier(v.min_tier));
  const activeVideo = resources.find((r) => r.id === activeVideoId) ?? null;
  const activeAllowed = activeVideo ? canAccessTier(activeVideo.min_tier) : false;
  const openLessons = resources.filter((r) => canAccessTier(r.min_tier));
  const doneCount = openLessons.filter((r) => viewed.has(r.id)).length;
  const percent = openLessons.length ? Math.round((doneCount / openLessons.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8 md:py-12 max-w-4xl">
        {previewTier && (
          <Card className="p-3 mb-6 bg-accent text-accent-foreground text-sm flex flex-wrap items-center justify-between gap-2">
            <span>
              תצוגה מקדימה: כך רואה את הקורס מי שבדרגת <strong>{TIER_LABELS[previewTier]}</strong>.
              {!course.is_published && " הקורס עדיין בטיוטה, ורק מנהל רואה אותו."}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/course/${course.id}`}>חזרה לעריכה</Link>
            </Button>
          </Card>
        )}
        <Link
          to="/courses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowRight size={16} />
          לכל הקורסים
        </Link>

        {/* Course header */}
        <div className="mb-8" data-area="K11">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant="secondary">{CATEGORY_LABELS[course.category]}</Badge>
            <Badge variant="outline">מנוי: {TIER_LABELS[course.min_tier]}</Badge>
            {course.duration_minutes != null && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock size={14} />
                {course.duration_minutes} דקות
              </span>
            )}
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-3">
            {course.title}
          </h1>
          {course.description && (
            <p className="text-muted-foreground">{course.description}</p>
          )}
        </div>

        {!user && (
          <Card className="p-4 mb-8 bg-secondary/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm">התחברו כדי לצפות בתכנים ולהוריד את המשאבים.</p>
            <Button asChild size="sm">
              <Link to="/auth">התחברות / הרשמה</Link>
            </Button>
          </Card>
        )}

        {tracking && openLessons.length > 0 && (
          <div className="mb-6 space-y-2" data-area="K14">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{doneCount === openLessons.length ? "סיימת את הקורס 🎉" : "ההתקדמות שלך"}</span>
              <span className="text-muted-foreground tabular-nums">{doneCount} מתוך {openLessons.length} שיעורים</span>
            </div>
            <Progress value={percent} aria-label="ההתקדמות בקורס" />
            {resumedFrom && (
              <p className="text-sm text-primary">ממשיכים מאיפה שעצרת: {resumedFrom}</p>
            )}
          </div>
        )}

        {/* Video player (only when the course has videos) */}
        {videoResources.length > 0 && (
          <div className="mb-6" data-area="K12">
            {activeVideo && activeAllowed && activeVideoSrc ? (
              <div className="rounded-xl overflow-hidden bg-black aspect-video">
                {activeVideoSrc.type === "iframe" ? (
                  <iframe
                    src={activeVideoSrc.src}
                    title={activeVideo.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video src={activeVideoSrc.src} controls className="w-full h-full" onPlay={() => noteViewed(activeVideo)} />
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-muted aspect-video flex items-center justify-center">
                <p className="text-muted-foreground">
                  {hasAnyUnlockedVideo
                    ? "בחרו סרטון מהרשימה"
                    : "התכנים נעולים — נדרשת רמת מנוי גבוהה יותר"}
                </p>
              </div>
            )}
          </div>
        )}

        {tracking && activeVideo && activeAllowed && !viewed.has(activeVideo.id) && (
          <div className="-mt-3 mb-6 flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1 text-primary" onClick={() => noteViewed(activeVideo)}>
              <CheckCircle2 size={16} />סימון השיעור כנצפה
            </Button>
          </div>
        )}

        {/* Unified content list: videos play inline, files download, links open */}
        <h2 className="text-xl font-bold text-foreground mb-4">תוכן הקורס</h2>
        {resources.length === 0 ? (
          <p className="text-muted-foreground">עדיין אין תוכן בקורס זה.</p>
        ) : (
          <ul className="space-y-2" data-area="K13">
            {resources.map((resource, index) => {
              const allowed = canAccessTier(resource.min_tier);
              const isVideo = isVideoResource(resource);
              const isActive = resource.id === activeVideoId;
              const isLink = !!resource.url && !resource.file_path && !isVideo;
              // a chapter heading before the first lesson of every chapter
              const chapterAt = sections.findIndex((s) => s.id === resource.section_id);
              const prevSection = index > 0 ? resources[index - 1].section_id ?? null : undefined;
              const startsChapter =
                sections.length > 0 && (index === 0 || (resource.section_id ?? null) !== prevSection);
              return (
                <li key={resource.id}>
                  {startsChapter && (
                    <h3 className={`font-semibold text-foreground mb-2 ${index > 0 ? "mt-5" : ""}`}>
                      {chapterAt >= 0 ? `פרק ${chapterAt + 1}: ${sections[chapterAt].title}` : "חומרים נוספים"}
                    </h3>
                  )}
                  <div
                    className={`w-full flex items-center justify-between gap-3 rounded-lg border p-3 transition-smooth ${
                      isActive ? "border-primary bg-primary/5" : "border-border"
                    } ${!allowed ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {!allowed ? (
                        <Lock size={18} className="text-muted-foreground shrink-0" />
                      ) : viewed.has(resource.id) ? (
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" aria-label="נצפה" />
                      ) : isVideo ? (
                        <Play size={18} className="text-primary shrink-0" />
                      ) : (
                        <FileText size={18} className="text-primary shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{resource.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {RESOURCE_TYPE_LABELS[resource.type]}
                          {!allowed && ` · נדרש ${TIER_LABELS[resource.min_tier]}`}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {!allowed ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          נדרש {TIER_LABELS[resource.min_tier]}
                        </Badge>
                      ) : isVideo ? (
                        <Button
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          className="gap-1"
                          onClick={() => play(resource)}
                        >
                          <Play size={14} />
                          {isActive ? "מתנגן" : "נגן"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleOpen(resource)}
                          disabled={downloadingId === resource.id}
                          title={isLink ? "פתח קישור" : "הורד קובץ"}
                        >
                          {downloadingId === resource.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : isLink ? (
                            <ExternalLink size={16} />
                          ) : (
                            <Download size={16} />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CoursePage;
