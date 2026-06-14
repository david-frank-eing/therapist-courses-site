import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, ClientStatus } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { CLIENT_STATUS_OPTIONS } from "@/lib/constants";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export type Client = Database["public"]["Tables"]["clients"]["Row"];

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onSaved: () => void;
}

interface FormState {
  full_name: string;
  phone: string;
  email: string;
  status: ClientStatus;
  notes: string;
}

const emptyForm: FormState = {
  full_name: "",
  phone: "",
  email: "",
  status: "active",
  notes: "",
};

export const ClientFormDialog = ({
  open,
  onOpenChange,
  client,
  onSaved,
}: ClientFormDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (client) {
      setForm({
        full_name: client.full_name ?? "",
        phone: client.phone ?? "",
        email: client.email ?? "",
        status: client.status,
        notes: client.notes ?? "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, client]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.full_name.trim()) {
      toast({ title: "שגיאה", description: "שם הוא שדה חובה", variant: "destructive" });
      return;
    }
    setIsSaving(true);

    const payload = {
      user_id: user.id,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    const { error } = client
      ? await supabase.from("clients").update(payload).eq("id", client.id)
      : await supabase.from("clients").insert(payload);

    setIsSaving(false);
    if (error) {
      toast({ title: "שמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: client ? "המטופל עודכן" : "המטופל נוסף" });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{client ? "עריכת מטופל" : "מטופל חדש"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c_name">שם מלא *</Label>
            <Input
              id="c_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c_phone">טלפון</Label>
              <Input
                id="c_phone"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>סטטוס</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as ClientStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="c_email">אימייל</Label>
            <Input
              id="c_email"
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="c_notes">הערות</Label>
            <Textarea
              id="c_notes"
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {client ? "עדכון" : "הוספה"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
