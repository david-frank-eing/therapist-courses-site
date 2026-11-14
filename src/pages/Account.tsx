import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check, Loader2, Lock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { FEATURES, tierName, useTierData } from "@/lib/tiers";
import { authErrorHe } from "@/lib/authErrors";

// "החשבון שלי" (M36): my details, my plan and what it opens, and changing my password.

const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { dateStyle: "long" }) : "";

const Account = () => {
  const { user, profile, isLoading, isAdmin, can, updatePassword } = useAuth();
  const { plans } = useTierData();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [financeOn, setFinanceOn] = useState(false);

  useEffect(() => { setName(profile?.full_name ?? ""); }, [profile?.full_name]);
  useEffect(() => {
    if (!user) return;
    (supabase as any).from("profiles").select("finance_enabled").eq("id", user.id).maybeSingle()
      .then(({ data }: { data: { finance_enabled?: boolean } | null }) => setFinanceOn(!!data?.finance_enabled));
  }, [user]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth?redirect=/account" replace />;

  const tier = profile?.subscription_tier ?? "free";
  const plan = plans.find((p) => p.tier === tier);
  const expires = profile?.subscription_expires_at ?? null;
  const expired = !!expires && new Date(expires) < new Date();

  const saveName = async () => {
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", user.id);
    setSavingName(false);
    if (error) return toast({ title: "השמירה נכשלה", description: error.message, variant: "destructive" });
    toast({ title: "השם נשמר" });
  };

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast({ title: "הסיסמה קצרה מדי", description: "צריך לפחות 6 תווים.", variant: "destructive" });
    if (pw !== pw2) return toast({ title: "הסיסמאות לא זהות", variant: "destructive" });
    setSavingPw(true);
    const { error } = await updatePassword(pw);
    setSavingPw(false);
    if (error) return toast({ title: "לא הצלחנו", description: authErrorHe(error), variant: "destructive" });
    setPw(""); setPw2("");
    toast({ title: "הסיסמה עודכנה" });
  };

  const rows = [
    { label: "קורסים", on: true, note: "לפי התכנית שנקבעה לכל קורס" },
    ...FEATURES.map((f) => ({ label: f.label, on: can(f.id), note: f.note })),
    { label: "כספים", on: isAdmin || financeOn, note: "נפתח אישית על ידי מנהל האתר" },
    { label: "לוח יד שנייה", on: true, note: "צפייה ופרסום מודעות" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8 max-w-3xl space-y-6" data-area="K36">
        <h1 className="text-2xl md:text-3xl font-bold">החשבון שלי</h1>

        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-bold">התכנית שלי</h2>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-2xl font-bold text-primary">{tierName(plans, tier)}</span>
            {plan && plan.price > 0 && <span className="text-muted-foreground">₪{plan.price} לחודש</span>}
            <span className={expired ? "text-destructive font-semibold" : "text-muted-foreground"}>
              {expires ? (expired ? `פג תוקף ב-${fmtDay(expires)}` : `בתוקף עד ${fmtDay(expires)}`) : "ללא הגבלת זמן"}
            </span>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2">
            {rows.map((r) => (
              <li key={r.label} className={`flex items-start gap-2 rounded-lg border p-2.5 ${r.on ? "" : "bg-muted/50 text-muted-foreground"}`}>
                {r.on ? <Check size={18} className="text-primary mt-0.5 shrink-0" /> : <Lock size={16} className="mt-0.5 shrink-0" />}
                <span><b className="font-semibold">{r.label}</b><span className="block text-xs text-muted-foreground">{r.note}</span></span>
              </li>
            ))}
          </ul>
          <Button variant="outline" asChild><Link to="/pricing">להשוות תכניות</Link></Button>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-bold">הפרטים שלי</h2>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label htmlFor="acc-name">שם מלא</Label>
              <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button onClick={saveName} disabled={savingName || name.trim() === (profile?.full_name ?? "")}>
              {savingName && <Loader2 size={16} className="animate-spin ml-1" />}שמירה
            </Button>
          </div>
          <div>
            <Label>אימייל</Label>
            <p dir="ltr" className="text-right text-muted-foreground">{user.email}</p>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-bold mb-3">שינוי סיסמה</h2>
          <form onSubmit={savePw} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div><Label htmlFor="pw1">סיסמה חדשה</Label><Input id="pw1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div><Label htmlFor="pw2">שוב, לאימות</Label><Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <Button type="submit" disabled={savingPw || !pw}>{savingPw && <Loader2 size={16} className="animate-spin ml-1" />}עדכון</Button>
          </form>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default Account;
