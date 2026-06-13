import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, ListingCategory } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { LISTING_CATEGORY_OPTIONS } from "@/lib/constants";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload } from "lucide-react";

export type Listing = Database["public"]["Tables"]["listings"]["Row"];

const BUCKET = "listing-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB per image

interface ListingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing | null;
  onSaved: () => void;
}

interface FormState {
  title: string;
  description: string;
  category: ListingCategory;
  price: string;
  city: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  title: "",
  description: "",
  category: "clinic_room",
  price: "",
  city: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  is_active: true,
};

export const ListingFormDialog = ({
  open,
  onOpenChange,
  listing,
  onSaved,
}: ListingFormDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (listing) {
      setForm({
        title: listing.title ?? "",
        description: listing.description ?? "",
        category: listing.category,
        price: listing.price ?? "",
        city: listing.city ?? "",
        contact_name: listing.contact_name ?? "",
        contact_phone: listing.contact_phone ?? "",
        contact_email: listing.contact_email ?? "",
        is_active: listing.is_active,
      });
    } else {
      setForm(emptyForm);
    }
    setFile(null);
  }, [open, listing]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "יש להתחבר כדי לפרסם", variant: "destructive" });
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      toast({ title: "שגיאה", description: "כותרת ותיאור הם שדות חובה", variant: "destructive" });
      return;
    }
    if (file && file.size > MAX_SIZE) {
      toast({ title: "התמונה גדולה מדי", description: "עד 5MB לתמונה.", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    let image_path = listing?.image_path ?? null;
    const oldPath = listing?.image_path ?? null;

    if (file) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const path = `${user.id}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false });
      if (uploadError) {
        setIsSaving(false);
        toast({ title: "העלאת התמונה נכשלה", description: uploadError.message, variant: "destructive" });
        return;
      }
      image_path = path;
    }

    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      price: form.price.trim() || null,
      city: form.city.trim() || null,
      image_path,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      is_active: form.is_active,
    };

    const { error } = listing
      ? await supabase.from("listings").update(payload).eq("id", listing.id)
      : await supabase.from("listings").insert(payload);

    if (error) {
      setIsSaving(false);
      toast({ title: "שמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }

    if (file && oldPath && oldPath !== image_path) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    setIsSaving(false);
    toast({ title: listing ? "המודעה עודכנה" : "המודעה פורסמה" });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{listing ? "עריכת מודעה" : "מודעה חדשה"}</DialogTitle>
          <DialogDescription>
            המודעה תתפרסם מיד ותהיה גלויה לכולם. פרטי הקשר ייחשפו רק למשתמשים מחוברים.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="l_title">כותרת *</Label>
            <Input
              id="l_title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="l_description">תיאור *</Label>
            <Textarea
              id="l_description"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>קטגוריה</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as ListingCategory })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LISTING_CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="l_city">עיר / מיקום</Label>
              <Input
                id="l_city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="l_price">מחיר</Label>
            <Input
              id="l_price"
              placeholder='לדוגמה: "1,500 ₪ לחודש" או "לתיאום"'
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="l_image">תמונה</Label>
            <Input
              id="l_image"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {listing?.image_path && !file && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Upload size={14} /> קיימת תמונה (העלה חדשה כדי להחליף)
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-sm font-medium">פרטי קשר (גלויים רק למחוברים)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="l_cname">שם</Label>
                <Input
                  id="l_cname"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="l_cphone">טלפון / וואטסאפ</Label>
                <Input
                  id="l_cphone"
                  dir="ltr"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="l_cemail">אימייל</Label>
              <Input
                id="l_cemail"
                type="email"
                dir="ltr"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              />
            </div>
          </div>

          {listing && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="l_active">מודעה פעילה</Label>
                <p className="text-sm text-muted-foreground">כבה כדי להסתיר מהלוח</p>
              </div>
              <Switch
                id="l_active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {listing ? "עדכון" : "פרסום"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
