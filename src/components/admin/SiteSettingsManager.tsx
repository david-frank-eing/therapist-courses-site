import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SITE_DEFAULTS, type SiteContentKey } from "@/hooks/useSiteSettings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type Form = Record<SiteContentKey, string>;

const emptyForm = Object.keys(SITE_DEFAULTS).reduce(
  (acc, k) => ({ ...acc, [k]: "" }),
  {} as Form
);

export const SiteSettingsManager = () => {
  const [form, setForm] = useState<Form>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        const next = { ...emptyForm };
        (Object.keys(SITE_DEFAULTS) as SiteContentKey[]).forEach((k) => {
          next[k] = data[k] ?? "";
        });
        setForm(next);
      }
      setIsLoading(false);
    };
    load();
  }, []);

  const set = (k: SiteContentKey, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setIsSaving(true);
    const payload: Record<string, string | null> = {};
    (Object.keys(SITE_DEFAULTS) as SiteContentKey[]).forEach((k) => {
      payload[k] = form[k].trim() || null;
    });
    const { error } = await supabase.from("site_settings").update(payload).eq("id", 1);
    setIsSaving(false);
    if (error) {
      toast({ title: "שמירה נכשלה", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["site_settings"] });
    toast({ title: "ההגדרות נשמרו", description: "התוכן עודכן באתר." });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const field = (k: SiteContentKey, label: string, textarea = false, ltr = false) => (
    <div className="space-y-2">
      <Label htmlFor={k}>{label}</Label>
      {textarea ? (
        <Textarea
          id={k}
          rows={4}
          value={form[k]}
          placeholder={SITE_DEFAULTS[k]}
          onChange={(e) => set(k, e.target.value)}
        />
      ) : (
        <Input
          id={k}
          value={form[k]}
          dir={ltr ? "ltr" : undefined}
          placeholder={SITE_DEFAULTS[k] || "—"}
          onChange={(e) => set(k, e.target.value)}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        עריכת התוכן הקבוע של האתר. שדה ריק יחזור לברירת המחדל. השינויים נשמרים מיד לכל המבקרים.
      </p>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground">פרטי קשר (בתחתית האתר)</h3>
        {field("contact_email", "אימייל", false, true)}
        {field("contact_phone", "טלפון", false, true)}
        {field("contact_address", "כתובת")}
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground">רשתות חברתיות (השאר ריק כדי להסתיר)</h3>
        {field("social_facebook", "פייסבוק (קישור)", false, true)}
        {field("social_instagram", "אינסטגרם (קישור)", false, true)}
        {field("social_linkedin", "לינקדאין (קישור)", false, true)}
        {field("social_youtube", "יוטיוב (קישור)", false, true)}
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground">סקשן "אודות" (בדף הבית)</h3>
        {field("about_title", "כותרת")}
        {field("about_text", "טקסט", true)}
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground">כותרת ראשית (Hero)</h3>
        {field("hero_badge", "תגית קטנה")}
        {field("hero_title", "כותרת ראשית")}
        {field("hero_subtitle", "תת‑כותרת", true)}
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          שמור שינויים
        </Button>
      </div>
    </div>
  );
};
