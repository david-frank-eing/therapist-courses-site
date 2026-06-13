import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
} from "lucide-react";

type Course = Database["public"]["Tables"]["courses"]["Row"];
type Resource = Database["public"]["Tables"]["course_resources"]["Row"];

const BUCKET = "course-files";

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
  const { user, canAccessTier } = useAuth();
  const { toast } = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeVideoSrc, setActiveVideoSrc] = useState<
    { type: "iframe" | "file"; src: string } | null
  >(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setIsLoading(true);
      const [{ data: courseData }, { data: resourceData }] = await Promise.all([
        supabase
          .from("courses")
          .select("*")
          .eq("id", id)
          .eq("is_published", true)
          .maybeSingle(),
        supabase
          .from("course_resources")
          .select("*")
          .eq("course_id", id)
          .eq("is_published", true)
          .order("order_index", { ascending: true }),
      ]);

      setCourse(courseData ?? null);
      const res = resourceData ?? [];
      setResources(res);

      const firstVideo = res.find(
        (r) => isVideoResource(r) && canAccessTier(r.min_tier)
      );
      setActiveVideoId(firstVideo?.id ?? null);
      setIsLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

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

  // Open / download a non-video resource (signed URL for files, direct for links)
  const handleOpen = async (resource: Resource) => {
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8 md:py-12 max-w-4xl">
        <Link
          to="/courses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6"
        >
          <ArrowRight size={16} />
          לכל הקורסים
        </Link>

        {/* Course header */}
        <div className="mb-8">
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

        {/* Video player (only when the course has videos) */}
        {videoResources.length > 0 && (
          <div className="mb-6">
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
                  <video src={activeVideoSrc.src} controls className="w-full h-full" />
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

        {/* Unified content list: videos play inline, files download, links open */}
        <h2 className="text-xl font-bold text-foreground mb-4">תוכן הקורס</h2>
        {resources.length === 0 ? (
          <p className="text-muted-foreground">עדיין אין תוכן בקורס זה.</p>
        ) : (
          <ul className="space-y-2">
            {resources.map((resource) => {
              const allowed = canAccessTier(resource.min_tier);
              const isVideo = isVideoResource(resource);
              const isActive = resource.id === activeVideoId;
              const isLink = !!resource.url && !resource.file_path && !isVideo;
              return (
                <li key={resource.id}>
                  <div
                    className={`w-full flex items-center justify-between gap-3 rounded-lg border p-3 transition-smooth ${
                      isActive ? "border-primary bg-primary/5" : "border-border"
                    } ${!allowed ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {!allowed ? (
                        <Lock size={18} className="text-muted-foreground shrink-0" />
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
                          onClick={() => setActiveVideoId(resource.id)}
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
