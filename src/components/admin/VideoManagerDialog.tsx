import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, SubscriptionTier } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { TIER_OPTIONS, TIER_LABELS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Course } from "./CourseFormDialog";

type Video = Database["public"]["Tables"]["videos"]["Row"];

interface VideoManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
}

interface VideoFormState {
  title: string;
  description: string;
  video_url: string;
  thumbnail_url: string;
  duration_minutes: string;
  min_tier: SubscriptionTier;
  order_index: string;
  is_published: boolean;
}

const emptyVideoForm: VideoFormState = {
  title: "",
  description: "",
  video_url: "",
  thumbnail_url: "",
  duration_minutes: "",
  min_tier: "free",
  order_index: "0",
  is_published: false,
};

export const VideoManagerDialog = ({
  open,
  onOpenChange,
  course,
}: VideoManagerDialogProps) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VideoFormState>(emptyVideoForm);
  const { toast } = useToast();

  const fetchVideos = async () => {
    if (!course) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .eq("course_id", course.id)
      .order("order_index", { ascending: true });
    if (!error && data) setVideos(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (open && course) {
      fetchVideos();
      setShowForm(false);
      setEditingId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, course?.id]);

  const startCreate = () => {
    setForm(emptyVideoForm);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (video: Video) => {
    setForm({
      title: video.title ?? "",
      description: video.description ?? "",
      video_url: video.video_url ?? "",
      thumbnail_url: video.thumbnail_url ?? "",
      duration_minutes:
        video.duration_minutes != null ? String(video.duration_minutes) : "",
      min_tier: video.min_tier,
      order_index: video.order_index != null ? String(video.order_index) : "0",
      is_published: !!video.is_published,
    });
    setEditingId(video.id);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course) return;
    if (!form.title.trim()) {
      toast({ title: "שגיאה", description: "כותרת היא שדה חובה", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const payload = {
      course_id: course.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      video_url: form.video_url.trim() || null,
      thumbnail_url: form.thumbnail_url.trim() || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      min_tier: form.min_tier,
      order_index: form.order_index ? Number(form.order_index) : 0,
      is_published: form.is_published,
    };

    const { error } = editingId
      ? await supabase.from("videos").update(payload).eq("id", editingId)
      : await supabase.from("videos").insert(payload);

    setIsSaving(false);

    if (error) {
      toast({ title: "שמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "הסרטון עודכן" : "הסרטון נוסף" });
    setShowForm(false);
    setEditingId(null);
    fetchVideos();
  };

  const handleDelete = async (video: Video) => {
    if (!confirm(`למחוק את הסרטון "${video.title}"?`)) return;
    const { error } = await supabase.from("videos").delete().eq("id", video.id);
    if (error) {
      toast({ title: "מחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הסרטון נמחק" });
    fetchVideos();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>סרטונים — {course?.title}</DialogTitle>
          <DialogDescription>ניהול הסרטונים המשויכים לקורס זה.</DialogDescription>
        </DialogHeader>

        {!showForm && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={startCreate} size="sm" className="gap-1">
                <Plus size={16} />
                סרטון חדש
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : videos.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">
                עדיין אין סרטונים בקורס זה.
              </p>
            ) : (
              <ul className="space-y-2">
                {videos.map((video) => (
                  <li
                    key={video.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{video.title}</span>
                        <Badge variant="secondary">{TIER_LABELS[video.min_tier]}</Badge>
                        {!video.is_published && (
                          <Badge variant="outline" className="text-muted-foreground">
                            טיוטה
                          </Badge>
                        )}
                      </div>
                      {video.duration_minutes != null && (
                        <p className="text-sm text-muted-foreground">
                          {video.duration_minutes} דקות
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(video)}>
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(video)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                {editingId ? "עריכת סרטון" : "סרטון חדש"}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowForm(false)}
              >
                <X size={18} />
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="v_title">כותרת *</Label>
              <Input
                id="v_title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="v_description">תיאור</Label>
              <Textarea
                id="v_description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="v_url">קישור לסרטון (YouTube / Vimeo / mp4)</Label>
              <Input
                id="v_url"
                value={form.video_url}
                onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                placeholder="https://..."
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="v_thumb">קישור לתמונה (thumbnail)</Label>
              <Input
                id="v_thumb"
                value={form.thumbnail_url}
                onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
                placeholder="https://..."
                dir="ltr"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="v_duration">משך (דקות)</Label>
                <Input
                  id="v_duration"
                  type="number"
                  min="0"
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v_order">סדר</Label>
                <Input
                  id="v_order"
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>רמת מנוי</Label>
                <Select
                  value={form.min_tier}
                  onValueChange={(v) => setForm({ ...form, min_tier: v as SubscriptionTier })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="v_published">מפורסם</Label>
                <p className="text-sm text-muted-foreground">יוצג לגולשים</p>
              </div>
              <Switch
                id="v_published"
                checked={form.is_published}
                onCheckedChange={(v) => setForm({ ...form, is_published: v })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                חזרה
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                {editingId ? "עדכון" : "הוספה"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
