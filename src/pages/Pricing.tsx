import { Header } from "@/components/Header";
import { PricingPreview } from "@/components/PricingPreview";
import { Footer } from "@/components/Footer";

// "/pricing" is linked from locked courses, the CRM upgrade notice and the signed-in home. Since 24/11/2026 it is NOT
// shown to visitors on the home page, the hero, the guest menu or the footer (David's decision: no plan names in public).
// Tiers are set by hand by the site admin (no online payment), so the page says how to join.
const Pricing = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <h1 className="sr-only">תכניות ומחירים</h1>
        <PricingPreview />
        <div className="container pb-16 -mt-6 text-center">
          <p className="text-muted-foreground max-w-xl mx-auto">
            ההרשמה לאתר חינם. דרגת המנוי נקבעת על ידי מנהל האתר אחרי ההרשמה.
            להצטרפות לתכנית בתשלום{" "}
            <a href="#contact" className="text-primary underline underline-offset-4">צרו קשר</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Pricing;
