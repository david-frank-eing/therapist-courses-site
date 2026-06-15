import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, SessionType } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { SESSION_TYPE_OPTIONS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export type Session = Database["public"]["Tables"]["sessions"]["Row"];

interface SessionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  session: Session | null;
  onSaved: () => void;
}

interface FormState {
  date: string;
  type: SessionType;
  duration_minutes: string;
  price: string;
  notes: string;
  is_paid: boolean;
}

const today = new Date().toISOString().split("T")[0];

const emptyForm: FormState = {
  date: today,
  type: "followup",
  duration_minutes: "50",
  price: "",
  notes: "",
  is_paid: false,
};

export const SessionFormDialog = ({
  open,
  onOpenChange,
  clientId,
  session,
  onSaved,
}: SessionFormDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (session) {
      setForm({
        date: session.date,
        type: session.type,
        duration_minutes: session.duration_minutes?.toString() ?? "",
        price: session.price?.toString() ?? "",
        notes: session.notes ?? "",
        is_paid: session.is_paid,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, session]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);

    const payload = {
      user_id: user.id,
      client_id: clientId,
      date: form.date,
      type: form.type,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      price: form.price ? parseFloat(form.price) : null,
      notes: form.notes.trim() || null,
      is_paid: form.is_paid,
    };

    const { error } = session
      ? await supabase.from("sessions").update(payload).eq("id", session.id)
      : await supabase.from("sessions").insert(payload);

    setIsSaving(false);
    if (error) {
      toast({ title: "שמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: session ? "הפגישה עודכנה" : "הפגישה נוספה" });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{session ? "עריכת פגישה" : "פגישה חדשה"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="s_date">תאריך *</Label>
              <Input
                id="s_date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>סוג פגישה</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as SessionType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="s_duration">משך (דקות)</Label>
              <Input
                id="s_duration"
                type="number"
                min={1}
                placeholder="50"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s_price">מחיר (₪)</Label>
              <Input
                id="s_price"
                type="number"
                min={0}
                step="0.01"
                placeholder="350"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="s_notes">הערות</Label>
            <Textarea
              id="s_notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg border p-3">
            <Checkbox
              id="s_paid"
              checked={form.is_paid}
              onCheckedChange={(v) => setForm({ ...form, is_paid: !!v })}
            />
            <Label htmlFor="s_paid" className="cursor-pointer font-medium">
              הפגישה שולמה
            </Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {session ? "עדכון" : "הוספה"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
