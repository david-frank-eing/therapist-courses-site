import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function ComingSoon() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile && ["premium", "vip"].includes(profile.subscription_tier)) {
      window.location.href = "/carlos-dashboard/";
    }
  }, [profile]);

  const isPending = user && profile && !["premium", "vip"].includes(profile.subscription_tier);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4" dir="rtl">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🚀</div>
        <h1 className="text-3xl font-bold mb-3">בקרוב</h1>
        <p className="text-muted-foreground text-lg mb-8">
          האתר נמצא בשלבי בנייה סופיים.<br />
          נחזור אליך בקרוב עם משהו מיוחד.
        </p>

        {!user && (
          <Button onClick={() => navigate("/auth")} size="lg" className="px-8">
            כניסה
          </Button>
        )}

        {isPending && (
          <div className="bg-muted rounded-xl px-6 py-4 text-sm text-muted-foreground">
            מחכים לאישור גישה — נחזור אליך בקרוב 👋
          </div>
        )}
      </div>
    </div>
  );
}
