import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink } from "lucide-react";

interface WhatsAppSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WhatsAppSettingsDialog = ({ open, onOpenChange }: WhatsAppSettingsDialogProps) => {
  const { profile } = useAuth();
  const { saveSettings } = useWhatsApp();
  const { toast } = useToast();
  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [template, setTemplate] = useState(
    "שלום {שם}, תזכורת לפגישה שלנו {מתי} בשעה {שעה}. נתראה! 🙏"
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !profile) return;
    setInstanceId(profile.wa_instance_id ?? "");
    setToken(profile.wa_api_token ?? "");
    setTemplate(
      profile.wa_reminder_template ??
      "שלום {שם}, תזכורת לפגישה שלנו {מתי} בשעה {שעה}. נתראה! 🙏"
    );
  }, [open, profile]);

  const handleSave = async () => {
    if (!instanceId.trim() || !token.trim()) {
      toast({ title: "שגיאה", description: "Instance ID ו-Token הם שדות חובה", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await saveSettings(instanceId.trim(), token.trim(), template.trim());
    setSaving(false);
    if (error) {
      toast({ title: "שמירה נכשלה", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "הגדרות נשמרו ✓" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>הגדרות WhatsApp — GreenAPI</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
          <p className="font-medium">איך מקבלים את הפרטים?</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>נכנסים ל-<a href="https://green-api.com" target="_blank" rel="noopener" className="text-primary underline inline-flex items-center gap-0.5">green-api.com <ExternalLink size={11} /></a></li>
            <li>נרשמים (יש free tier)</li>
            <li>יוצרים Instance → מחברים טלפון</li>
            <li>מעתיקים את <strong>idInstance</strong> ו-<strong>apiTokenInstance</strong></li>
          </ol>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wa_instance">Instance ID</Label>
            <Input
              id="wa_instance"
              dir="ltr"
              placeholder="1234567890"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa_token">API Token</Label>
            <Input
              id="wa_token"
              dir="ltr"
              type="password"
              placeholder="••••••••••••••••"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa_template">תבנית הודעה</Label>
            <Textarea
              id="wa_template"
              rows={3}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              משתנים: <code>{"{שם}"}</code> · <code>{"{מתי}"}</code> · <code>{"{שעה}"}</code>
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            שמור
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
