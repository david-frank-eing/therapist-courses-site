import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.string().min(6, "הסיסמה חייבת להכיל לפחות 6 תווים");

type Status = "checking" | "ready" | "invalid";

const ResetPassword = () => {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Detect if this is an invite flow (type=invite in URL hash)
  const isInvite = typeof window !== 'undefined' &&
    (window.location.hash.includes('type=invite') || window.location.search.includes('type=invite'));

  // The recovery/invite link establishes a temporary session (detectSessionInUrl).
  // We wait for it via onAuthStateChange / getSession before showing the form.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || session) {
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setStatus("ready");
      } else {
        setTimeout(() => {
          setStatus((current) => (current === "checking" ? "invalid" : current));
        }, 2500);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validate = () => {
    const newErrors: { password?: string; confirm?: string } = {};
    const result = passwordSchema.safeParse(password);
    if (!result.success) {
      newErrors.password = result.error.errors[0].message;
    }
    if (password !== confirm) {
      newErrors.confirm = "הסיסמאות אינן תואמות";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const { error } = await updatePassword(password);
    setIsSubmitting(false);

    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: isInvite ? "ברוך הבא! הסיסמה נקבעה" : "הסיסמה עודכנה",
      description: isInvite ? "החשבון שלך מוכן. מיד תועבר לדאשבורד." : "הסיסמה החדשה נשמרה. אתם מחוברים.",
    });
    window.location.href = isInvite ? "/carlos-dashboard/" : "/";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-lg gradient-hero flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-2xl">מ</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">מרחב למטפלים</h1>
        </div>

        <Card className="shadow-card">
          <CardHeader className="text-center">
            <CardTitle>{isInvite ? "ברוך הבא! קבע סיסמה" : "קביעת סיסמה חדשה"}</CardTitle>
            <CardDescription>
              {status === "ready"
                ? isInvite
                  ? "בחר סיסמה כדי להשלים את ההרשמה לדאשבורד"
                  : "בחרו סיסמה חדשה לחשבון שלכם"
                : status === "checking"
                ? "מאמתים את הקישור..."
                : "הקישור אינו תקף"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === "checking" && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {status === "invalid" && (
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  קישור האיפוס אינו תקף או שפג תוקפו. בקשו קישור חדש ממסך ההתחברות.
                </p>
                <Button asChild className="w-full">
                  <Link to="/auth">חזרה להתחברות</Link>
                </Button>
              </div>
            )}

            {status === "ready" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">סיסמה חדשה</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrors({ ...errors, password: undefined });
                      }}
                      placeholder="••••••••"
                      dir="ltr"
                      className={errors.password ? "border-destructive" : ""}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">אימות סיסמה</Label>
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setErrors({ ...errors, confirm: undefined });
                    }}
                    placeholder="••••••••"
                    dir="ltr"
                    className={errors.confirm ? "border-destructive" : ""}
                  />
                  {errors.confirm && (
                    <p className="text-sm text-destructive">{errors.confirm}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      שומר...
                    </>
                  ) : (
                    "שמירת סיסמה"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
