import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

// The screen every non-admin sees on a closed page while the site is in maintenance mode (MAINTENANCE_MODE in App.tsx).
// Since 21/11/2026 the business assistant is open to everyone, so this screen leads with it and says plainly
// that the rest of the site opens later. A member who already has access to the dashboard is sent there.

export default function ComingSoon() {
  const { user, profile, isAdmin, isLoading, hasPaidTools } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // only after the admin check is done, and never for an admin
    if (!isLoading && !isAdmin && profile && hasPaidTools) {
      window.location.href = "/carlos-dashboard/";
    }
  }, [profile, isAdmin, isLoading, hasPaidTools]);

  const isPending = user && profile && !hasPaidTools;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4" dir="rtl">
      <div className="text-center max-w-md">
        <img src="/logo.png" alt="הכול בידיים - מרכז מידע למטפלים במגע" className="h-20 w-auto mx-auto mb-6" />
        <h1 className="text-3xl font-bold mb-3">העוזר העסקי פתוח עכשיו</h1>
        <p className="text-muted-foreground text-lg mb-8">
          כמה שאלות קצרות, ואתם מקבלים ערוץ אחד להתחיל ממנו, שלוש פעולות לשבוע ונוסח לפנייה הראשונה. בחינם.
        </p>

        {!user && (
          <div className="flex flex-col gap-3 items-center">
            <Button onClick={() => navigate("/assistant")} size="lg" variant="cta" className="px-8 w-full max-w-xs">
              נסו את העוזר העסקי בחינם
            </Button>
            <Button onClick={() => navigate("/auth")} size="lg" variant="outline" className="px-8 w-full max-w-xs">
              כניסה לחשבון
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = "/auth?redirect=/carlos-dashboard/"}
            >
              יש לי חשבון עם גישה לדאשבורד
            </Button>
          </div>
        )}

        {isPending && (
          <div className="flex flex-col gap-3 items-center">
            <Button onClick={() => navigate("/assistant")} size="lg" variant="cta" className="px-8 w-full max-w-xs">
              נסו את העוזר העסקי בחינם
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = "/auth?redirect=/carlos-dashboard/"}
            >
              כבר יש לי גישה לדאשבורד
            </Button>
          </div>
        )}

        <p className="text-sm text-muted-foreground mt-8">
          שאר חלקי האתר (קורסים, לוח מודעות וכלי הניהול) ייפתחו בקרוב, ונעדכן אתכם.
        </p>
      </div>
    </div>
  );
}
