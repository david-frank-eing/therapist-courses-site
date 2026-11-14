import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Check, Crown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { FEATURES, featuresSplit, isAllowed, useTierData, type AccessRow, type TierPlan } from "@/lib/tiers";

// the pricing cards are built from the admin "דרגות" tab: the texts from tier_plans, and the work tools each
// tier opens from tier_access (so the page always matches what the site actually lets you do)

export const toolsOf = (access: AccessRow[], tier: string): string[] =>
  featuresSplit(access) ? FEATURES.filter((f) => isAllowed(access, f.id, tier)).map((f) => f.label) : [];

interface PlanCardProps {
  plan: TierPlan;
  tools: string[];
  current?: boolean;
  action?: React.ReactNode;
}

export const PlanCard = ({ plan, tools, current, action }: PlanCardProps) => (
  <Card
    className={`relative overflow-hidden h-full flex flex-col ${
      plan.highlighted ? "border-primary shadow-card-hover ring-2 ring-primary/20" : "shadow-card"
    } ${current ? "ring-2 ring-amber-500/50" : ""}`}
  >
    {plan.highlighted && <div className="absolute top-0 right-0 left-0 h-1 gradient-hero" />}
    <CardHeader className="text-center pb-4">
      {current ? (
        <div className="flex items-center justify-center gap-1 text-amber-600 text-sm font-bold mb-2">התכנית שלך</div>
      ) : plan.highlighted ? (
        <div className="flex items-center justify-center gap-1 text-primary text-sm font-medium mb-2">
          <Crown size={16} />
          הכי פופולרי
        </div>
      ) : null}
      <CardTitle className="text-xl">{plan.name}</CardTitle>
      {plan.tagline && <p className="text-muted-foreground text-sm">{plan.tagline}</p>}
      <div className="mt-4">
        <span className="text-4xl font-bold text-foreground">₪{plan.price}</span>
        <span className="text-muted-foreground">/חודש</span>
      </div>
    </CardHeader>
    <CardContent className="flex-1 flex flex-col">
      <ul className="space-y-3 mb-6 flex-1">
        {[...tools, ...plan.perks].map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Check size={18} className="text-primary shrink-0 mt-0.5" />
            <span className={`text-foreground ${i < tools.length ? "font-semibold" : ""}`}>{feature}</span>
          </li>
        ))}
      </ul>
      {action}
    </CardContent>
  </Card>
);

export const PricingPreview = () => {
  const { plans, access } = useTierData();
  const { user, profile } = useAuth();

  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">תכניות מנויים</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">בחרו את התכנית המתאימה לכם והתחילו ללמוד היום</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const current = !!user && profile?.subscription_tier === plan.tier;
            const variant = plan.highlighted ? "default" : "outline";
            const action = current ? (
              <Button className="w-full" variant="outline" disabled>התכנית הנוכחית שלך</Button>
            ) : user ? (
              // tiers are set by hand by the site admin (no online payment), so a member asks to switch
              <Button className="w-full" variant={variant} asChild>
                <a href="#contact">לעבור לתכנית הזו</a>
              </Button>
            ) : (
              <Button className="w-full" variant={variant} asChild>
                <Link to="/auth">{plan.price === 0 ? "התחילו בחינם" : "בחרו תכנית"}</Link>
              </Button>
            );
            return <PlanCard key={plan.tier} plan={plan} tools={toolsOf(access, plan.tier)} current={current} action={action} />;
          })}
        </div>
      </div>
    </section>
  );
};
