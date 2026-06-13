import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, ResourceType, SubscriptionTier } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import {
  RESOURCE_TYPE_OPTIONS,
  RESOURCE_TYPE_LABELS,
  TIER_OPTIONS,
  TIER_LABELS,
} from "@/lib/constants";
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
import { Loader2, Pencil, Plus, Trash2, X, FileText, Upload } from "lucide-react";
import type { Course } from "./CourseFormDialog";

type Resource = Database["public"]["Tables"]["course_resources"]["Row"];

const BUCKET = "course-files";

interface ResourceManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
}

interface ResourceFormState {
  title: string;
  description: string;
  type: ResourceType;
  url: string;
  min_tier: SubscriptionTier;
  order_index: string;
  is_published: boolean;
}

const emptyForm: ResourceFormState = {
  title: "",
  description: "",
  type: "video",
  url: "",
  min_tier: "free",
  order_index: "0",
  is_published: false,
};

export const ResourceManagerDialog = ({
  open,
  onOpenChange,
  course,
}: ResourceManagerDialogProps) => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ResourceFormState>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  const fetchResources = async () => {
    if (!course) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("course_resources")
      .select("*")
      .eq("course_id", course.id)
      .order("order_index", { ascending: true });
    if (!error && data) setResources(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (open && course) {
      fetchResources();
      setShowForm(false);
      setEditing(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, course?.id]);

  const startCreate = () => {
    setForm(emptyForm);
    setFile(null);
    setEditing(null);
    setShowForm(true);
  };

  const startEdit = (resource: Resource) => {
    setForm({
      title: resource.title ?? "",
      description: resource.description ?? "",
      type: resource.type,
      url: resource.url ?? "",
      min_tier: resource.min_tier,
      order_index: resource.order_index != null ? String(resource.order_index) : "0",
      is_published: !!resource.is_published,
    });
    setFile(null);
    setEditing(resource);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course) return;
    if (!form.title.trim()) {
      toast({ title: "שגיאה", description: "כותרת היא שדה חובה", variant: "destructive" });
      return;
    }
    const hasUrl = !!form.url.trim();
    if (!editing && !file && !hasUrl) {
      toast({
        title: "שגיאה",
        description: "יש לבחור קובץ להעלאה או להדביק קישור (לסרטוני יוטיוב/וימאו)",
        variant: "destructive",
      });
      return;
    }
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB — Supabase free-tier per-file limit
    if (file && file.size > MAX_SIZE) {
      toast({
        title: "הקובץ גדול מדי",
        description:
          "הגודל המרבי הוא 50MB. לסרטונים גדולים השתמש בקישור (YouTube/Vimeo) דרך ניהול הסרטונים.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    let file_path = editing?.file_path ?? null;
    let file_name = editing?.file_name ?? null;
    const oldPath = editing?.file_path ?? null;

    // Upload a new file if one was chosen
    if (file) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const path = `${course.id}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false });
      if (uploadError) {
        setIsSaving(false);
        toast({ title: "העלאה נכשלה", description: uploadError.message, variant: "destructive" });
        return;
      }
      file_path = path;
      file_name = file.name;
    }

    const payload = {
      course_id: course.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      file_path,
      file_name,
      url: form.url.trim() || null,
      min_tier: form.min_tier,
      order_index: form.order_index ? Number(form.order_index) : 0,
      is_published: form.is_published,
    };

    const { error } = editing
      ? await supabase.from("course_resources").update(payload).eq("id", editing.id)
      : await supabase.from("course_resources").insert(payload);

    if (error) {
      setIsSaving(false);
      toast({ title: "שמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }

    // Clean up the replaced file (best effort)
    if (file && oldPath && oldPath !== file_path) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    setIsSaving(false);
    toast({ title: editing ? "המשאב עודכן" : "המשאב נוסף" });
    setShowForm(false);
    setEditing(null);
    setFile(null);
    fetchResources();
  };

  const handleDelete = async (resource: Resource) => {
    if (!confirm(`למחוק את המשאב "${resource.title}"?`)) return;
    const { error } = await supabase.from("course_resources").delete().eq("id", resource.id);
    if (error) {
      toast({ title: "מחיקה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    if (resource.file_path) {
      await supabase.storage.from(BUCKET).remove([resource.file_path]);
    }
    toast({ title: "המשאב נמחק" });
    fetchResources();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>תוכן ומשאבים — {course?.title}</DialogTitle>
          <DialogDescription>
            סרטונים (קישור יוטיוב/וימאו), מסמכים, מצגות וקבצים. וידאו ינוגן בדף הקורס,
            השאר ניתן להורדה — הכל בכפוף לרמת המנוי.
          </DialogDescription>
        </DialogHeader>

        {!showForm && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={startCreate} size="sm" className="gap-1">
                <Plus size={16} />
                משאב חדש
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : resources.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">
                עדיין אין משאבים בקורס זה.
              </p>
            ) : (
              <ul className="space-y-2">
                {resources.map((resource) => (
                  <li
                    key={resource.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <FileText className="text-primary shrink-0" size={20} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{resource.title}</span>
                          <Badge variant="outline">{RESOURCE_TYPE_LABELS[resource.type]}</Badge>
                          <Badge variant="secondary">{TIER_LABELS[resource.min_tier]}</Badge>
                          {!resource.is_published && (
                            <Badge variant="outline" className="text-muted-foreground">
                              טיוטה
                            </Badge>
                          )}
                        </div>
                        {resource.file_name ? (
                          <p className="text-sm text-muted-foreground truncate">
                            {resource.file_name}
                          </p>
                        ) : resource.url ? (
                          <p className="text-sm text-muted-foreground truncate" dir="ltr">
                            {resource.url}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(resource)}>
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(resource)}
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
              <h3 className="font-semibold">{editing ? "עריכת משאב" : "משאב חדש"}</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                <X size={18} />
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="r_title">כותרת *</Label>
              <Input
                id="r_title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="r_description">תיאור</Label>
              <Textarea
                id="r_description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="r_file">קובץ</Label>
              <Input
                id="r_file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                העלה קובץ (מסמך, מצגת, PDF, תמונה, אודיו, וידאו, ZIP — עד 50MB)
                <strong> או </strong>
                הדבק קישור למטה (מומלץ לסרטונים).
              </p>
              {editing?.file_name && !file && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Upload size={14} /> קובץ נוכחי: {editing.file_name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="r_url">קישור (URL)</Label>
              <Input
                id="r_url"
                type="url"
                dir="ltr"
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                לסרטונים: הדבק קישור יוטיוב/וימאו — הם ינוגנו ישירות בדף הקורס.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>סוג</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as ResourceType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOURCE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <div className="space-y-2">
                <Label htmlFor="r_order">סדר</Label>
                <Input
                  id="r_order"
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: e.target.value })}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="r_published">מפורסם</Label>
                <p className="text-sm text-muted-foreground">יוצג בדף הקורס</p>
              </div>
              <Switch
                id="r_published"
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
                {editing ? "עדכון" : "העלאה"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
