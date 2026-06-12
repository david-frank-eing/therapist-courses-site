import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, SubscriptionTier } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { TIER_OPTIONS } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, User } from "lucide-react";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const UsersManager = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchProfiles = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setProfiles(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const changeTier = async (profile: Profile, tier: SubscriptionTier) => {
    setSavingId(profile.id);
    const { error } = await supabase
      .from("profiles")
      .update({ subscription_tier: tier })
      .eq("id", profile.id);
    setSavingId(null);

    if (error) {
      toast({ title: "עדכון נכשל", description: error.message, variant: "destructive" });
      return;
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, subscription_tier: tier } : p))
    );
    toast({ title: "רמת המנוי עודכנה" });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground">לא נמצאו משתמשים.</Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        קביעת רמת המנוי של כל משתמש. הרמה קובעת לאילו קורסים, סרטונים ומשאבים יש למשתמש גישה.
      </p>
      {profiles.map((profile) => (
        <Card
          key={profile.id}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
              <User size={18} className="text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{profile.full_name || "ללא שם"}</p>
              <p className="text-sm text-muted-foreground truncate" dir="ltr">
                {profile.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {savingId === profile.id && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
            <Select
              value={profile.subscription_tier}
              onValueChange={(v) => changeTier(profile, v as SubscriptionTier)}
            >
              <SelectTrigger className="w-36">
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
        </Card>
      ))}
    </div>
  );
};
