import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";

type Mode = "login" | "signup" | "forgot";

const emailSchema = z.string().email("כתובת אימייל לא תקינה");
const passwordSchema = z.string().min(6, "הסיסמה חייבת להכיל לפחות 6 תווים");

const titles: Record<Mode, { title: string; description: string }> = {
  login: { title: "התחברות", description: "התחברו לחשבון שלכם כדי לצפות בקורסים" },
  signup: { title: "הרשמה", description: "צרו חשבון חדש והתחילו ללמוד" },
  forgot: { title: "שחזור סיסמה", description: "הזינו את האימייל שלכם ונשלח קישור לאיפוס הסיסמה" },
};

const Auth = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const { user, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      // Use full page navigation so static files (e.g. /carlos-dashboard/) load correctly
      window.location.href = redirectTo;
    }
  }, [user, redirectTo]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    if (mode !== "forgot") {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) {
        newErrors.password = passwordResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (mode === "forgot") {
        const { error } = await resetPassword(email);
        if (error) {
          toast({ title: "שגיאה", description: error.message, variant: "destructive" });
        } else {
          toast({
            title: "הקישור נשלח",
            description: "אם קיים חשבון עם אימייל זה, נשלח אליו קישור לאיפוס הסיסמה. בדקו גם בתיקיית הספאם.",
          });
          switchMode("login");
        }
      } else if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast({
              title: "שגיאת התחברות",
              description: "אימייל או סיסמה שגויים",
              variant: "destructive",
            });
          } else {
            toast({ title: "שגיאה", description: error.message, variant: "destructive" });
          }
        } else {
          toast({ title: "התחברת בהצלחה!", description: "ברוכים הבאים למרחב למטפלים" });
          window.location.href = redirectTo;
        }
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes("User already registered")) {
            toast({
              title: "משתמש קיים",
              description: "כתובת האימייל הזו כבר רשומה במערכת",
              variant: "destructive",
            });
          } else {
            toast({ title: "שגיאה", description: error.message, variant: "destructive" });
          }
        } else {
          toast({ title: "נרשמת בהצלחה!", description: "ברוכים הבאים למרחב למטפלים" });
          window.location.href = redirectTo;
        }
      }
    } catch (error) {
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה בלתי צפויה",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLabel =
    mode === "login" ? "התחברות" : mode === "signup" ? "הרשמה" : "שליחת קישור איפוס";
  const submitLoadingLabel =
    mode === "login" ? "מתחבר..." : mode === "signup" ? "נרשם..." : "שולח...";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-lg gradient-hero flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-2xl">מ</span>
            </div>
          </a>
          <h1 className="text-2xl font-bold text-foreground">מרחב למטפלים</h1>
          <p className="text-muted-foreground mt-2">פלטפורמת הקורסים למטפלים</p>
        </div>

        <Card className="shadow-card">
          <CardHeader className="text-center">
            <CardTitle>{titles[mode].title}</CardTitle>
            <CardDescription>{titles[mode].description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">שם מלא</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ישראל ישראלי"
                    dir="rtl"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">אימייל</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors({ ...errors, email: undefined });
                  }}
                  placeholder="email@example.com"
                  dir="ltr"
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              {mode !== "forgot" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">סיסמה</Label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => switchMode("forgot")}
                        className="text-primary hover:underline text-sm"
                      >
                        שכחת סיסמה?
                      </button>
                    )}
                  </div>
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
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    {submitLoadingLabel}
                  </>
                ) : (
                  submitLabel
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="text-primary hover:underline text-sm"
                >
                  אין לכם חשבון? הירשמו עכשיו
                </button>
              )}
              {mode === "signup" && (
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-primary hover:underline text-sm"
                >
                  כבר יש לכם חשבון? התחברו
                </button>
              )}
              {mode === "forgot" && (
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-primary hover:underline text-sm"
                >
                  חזרה להתחברות
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
