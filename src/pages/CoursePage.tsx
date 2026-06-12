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
import { Loader2, Lock, Play, FileText, Download, Clock, ArrowRight } from "lucide-react";

type Course = Database["public"]["Tables"]["courses"]["Row"];
type Video = Database["public"]["Tables"]["videos"]["Row"];
type Resource = Database["public"]["Tables"]["course_resources"]["Row"];

const BUCKET = "course-files";

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
  const [videos, setVideos] = useState<Video[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setIsLoading(true);
      const [{ data: courseData }, { data: videoData }, { data: resourceData }] =
        await Promise.all([
          supabase.from("courses").select("*").eq("id", id).eq("is_published", true).maybeSingle(),
          supabase
            .from("videos")
            .select("*")
            .eq("course_id", id)
            .eq("is_published", true)
            .order("order_index", { ascending: true }),
          supabase
            .from("course_resources")
            .select("*")
            .eq("course_id", id)
            .eq("is_published", true)
            .order("order_index", { ascending: true }),
        ]);

      setCourse(courseData ?? null);
      setVideos(videoData ?? []);
      setResources(resourceData ?? []);

      const firstUnlocked = (videoData ?? []).find((v) => canAccessTier(v.min_tier));
      setActiveVideoId(firstUnlocked?.id ?? null);
      setIsLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  const handleDownload = async (resource: Resource) => {
    if (!resource.file_path) {
      if (resource.url) window.open(resource.url, "_blank");
      return;
    }
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
          <p className="text-muted-foreground mb-6">ייתכן שהקורס אינו קיים או שאינו מפורסם.</p>
          <Button asChild>
            <Link to="/courses">לכל הקורסים</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const activeVideo = videos.find((v) => v.id === activeVideoId) ?? null;
  const activeAllowed = activeVideo ? canAccessTier(activeVideo.min_tier) : false;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8 md:py-12">
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
          <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-3">{course.title}</h1>
          {course.description && (
            <p className="text-muted-foreground max-w-3xl">{course.description}</p>
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

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Player + playlist */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold text-foreground">סרטונים</h2>

            {videos.length === 0 ? (
              <p className="text-muted-foreground">עדיין אין סרטונים בקורס זה.</p>
            ) : (
              <>
                {/* Active player */}
                {activeVideo && activeAllowed && activeVideo.video_url ? (
                  <div className="rounded-xl overflow-hidden bg-black aspect-video">
                    {getVideoEmbed(activeVideo.video_url).type === "iframe" ? (
                      <iframe
                        src={getVideoEmbed(activeVideo.video_url).src}
                        title={activeVideo.title}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video src={activeVideo.video_url} controls className="w-full h-full" />
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-muted aspect-video flex items-center justify-center">
                    <p className="text-muted-foreground">
                      {videos.some((v) => canAccessTier(v.min_tier))
                        ? "בחרו סרטון מהרשימה"
                        : "התכנים נעולים — נדרשת רמת מנוי גבוהה יותר"}
                    </p>
                  </div>
                )}

                {/* Playlist */}
                <ul className="space-y-2">
                  {videos.map((video) => {
                    const allowed = canAccessTier(video.min_tier);
                    const isActive = video.id === activeVideoId;
                    return (
                      <li key={video.id}>
                        <button
                          type="button"
                          disabled={!allowed}
                          onClick={() => allowed && setActiveVideoId(video.id)}
                          className={`w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-right transition-smooth ${
                            isActive
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-accent"
                          } ${!allowed ? "opacity-70 cursor-not-allowed" : ""}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {allowed ? (
                              <Play size={18} className="text-primary shrink-0" />
                            ) : (
                              <Lock size={18} className="text-muted-foreground shrink-0" />
                            )}
                            <span className="truncate font-medium">{video.title}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!allowed && (
                              <Badge variant="outline" className="text-muted-foreground">
                                נדרש {TIER_LABELS[video.min_tier]}
                              </Badge>
                            )}
                            {video.duration_minutes != null && (
                              <span className="text-sm text-muted-foreground">
                                {video.duration_minutes}′
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Resources */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">משאבים להורדה</h2>
            {resources.length === 0 ? (
              <p className="text-muted-foreground">אין משאבים בקורס זה.</p>
            ) : (
              <ul className="space-y-2">
                {resources.map((resource) => {
                  const allowed = canAccessTier(resource.min_tier);
                  return (
                    <li
                      key={resource.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="text-primary shrink-0" size={20} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{resource.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {RESOURCE_TYPE_LABELS[resource.type]}
                            {!allowed && ` · נדרש ${TIER_LABELS[resource.min_tier]}`}
                          </p>
                        </div>
                      </div>
                      {allowed ? (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDownload(resource)}
                          disabled={downloadingId === resource.id}
                        >
                          {downloadingId === resource.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Download size={16} />
                          )}
                        </Button>
                      ) : (
                        <Lock size={18} className="text-muted-foreground shrink-0" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CoursePage;
