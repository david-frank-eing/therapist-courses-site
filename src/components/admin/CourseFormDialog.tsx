import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, CourseCategory, SubscriptionTier } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_OPTIONS, TIER_OPTIONS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export type Course = Database["public"]["Tables"]["courses"]["Row"];

interface CourseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course | null;
  onSaved: () => void;
}

interface FormState {
  title: string;
  description: string;
  category: CourseCategory;
  min_tier: SubscriptionTier;
  thumbnail_url: string;
  duration_minutes: string;
  order_index: string;
  is_published: boolean;
}

const emptyForm: FormState = {
  title: "",
  description: "",
  category: "business",
  min_tier: "free",
  thumbnail_url: "",
  duration_minutes: "",
  order_index: "0",
  is_published: false,
};

export const CourseFormDialog = ({
  open,
  onOpenChange,
  course,
  onSaved,
}: CourseFormDialogProps) => {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const isEditing = !!course;

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title ?? "",
        description: course.description ?? "",
        category: course.category,
        min_tier: course.min_tier,
        thumbnail_url: course.thumbnail_url ?? "",
        duration_minutes:
          course.duration_minutes != null ? String(course.duration_minutes) : "",
        order_index: course.order_index != null ? String(course.order_index) : "0",
        is_published: !!course.is_published,
      });
    } else {
      setForm(emptyForm);
    }
  }, [course, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "שגיאה", description: "כותרת היא שדה חובה", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      min_tier: form.min_tier,
      thumbnail_url: form.thumbnail_url.trim() || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      order_index: form.order_index ? Number(form.order_index) : 0,
      is_published: form.is_published,
    };

    const { error } = isEditing
      ? await supabase.from("courses").update(payload).eq("id", course!.id)
      : await supabase.from("courses").insert(payload);

    setIsSaving(false);

    if (error) {
      toast({ title: "שמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: isEditing ? "הקורס עודכן" : "הקורס נוצר" });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "עריכת קורס" : "קורס חדש"}</DialogTitle>
          <DialogDescription>
            מלא את פרטי הקורס. רק קורסים שמסומנים כ"מפורסם" יוצגו באתר.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">כותרת *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="שם הקורס"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">תיאור</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="תיאור קצר של הקורס"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>קטגוריה</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as CourseCategory })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>רמת מנוי מינימלית</Label>
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

          <div className="space-y-2">
            <Label htmlFor="thumbnail_url">קישור לתמונה (thumbnail)</Label>
            <Input
              id="thumbnail_url"
              value={form.thumbnail_url}
              onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
              placeholder="https://..."
              dir="ltr"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration_minutes">משך (דקות)</Label>
              <Input
                id="duration_minutes"
                type="number"
                min="0"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order_index">סדר תצוגה</Label>
              <Input
                id="order_index"
                type="number"
                value={form.order_index}
                onChange={(e) => setForm({ ...form, order_index: e.target.value })}
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="is_published">מפורסם</Label>
              <p className="text-sm text-muted-foreground">יוצג באתר לגולשים</p>
            </div>
            <Switch
              id="is_published"
              checked={form.is_published}
              onCheckedChange={(v) => setForm({ ...form, is_published: v })}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {isEditing ? "עדכון" : "יצירה"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
