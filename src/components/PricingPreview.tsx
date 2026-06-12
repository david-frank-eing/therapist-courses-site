import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Check, Crown } from "lucide-react";

const tiers = [
  {
    name: "חינם",
    price: "0",
    description: "התחלה מושלמת",
    features: [
      "גישה לקורסים בסיסיים",
      "תוכן AI למתחילים",
      "שאלות ותשובות בקהילה"
    ],
    highlighted: false
  },
  {
    name: "בסיסי",
    price: "49",
    description: "למטפל המתפתח",
    features: [
      "כל התכנים של חינם",
      "קורסים מתקדמים בעסק",
      "כלי AI מתקדמים",
      "הורדת חומרים"
    ],
    highlighted: false
  },
  {
    name: "פרימיום",
    price: "99",
    description: "לצמיחה מהירה",
    features: [
      "כל התכנים של בסיסי",
      "קורסי מילוי קליניקה",
      "תבניות שיווק מוכנות",
      "שיחות ייעוץ חודשיות"
    ],
    highlighted: true
  },
  {
    name: "VIP",
    price: "149",
    description: "ליווי אישי מלא",
    features: [
      "כל התכנים של פרימיום",
      "ליווי אישי 1:1",
      "גישה לתכנים בלעדיים",
      "קבוצת מאסטרמיינד"
    ],
    highlighted: false
  }
];

export const PricingPreview = () => {
  return (
    <section className="py-16 md:py-24">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            תכניות מנויים
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            בחרו את התכנית המתאימה לכם והתחילו ללמוד היום
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => (
            <Card 
              key={tier.name}
              className={`relative overflow-hidden ${
                tier.highlighted 
                  ? "border-primary shadow-card-hover ring-2 ring-primary/20" 
                  : "shadow-card"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute top-0 right-0 left-0 h-1 gradient-hero" />
              )}
              <CardHeader className="text-center pb-4">
                {tier.highlighted && (
                  <div className="flex items-center justify-center gap-1 text-primary text-sm font-medium mb-2">
                    <Crown size={16} />
                    הכי פופולרי
                  </div>
                )}
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <p className="text-muted-foreground text-sm">{tier.description}</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">₪{tier.price}</span>
                  <span className="text-muted-foreground">/חודש</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check size={18} className="text-primary shrink-0 mt-0.5" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full" 
                  variant={tier.highlighted ? "default" : "outline"}
                  asChild
                >
                  <Link to="/auth">
                    {tier.price === "0" ? "התחילו בחינם" : "בחרו תכנית"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
