import { Header } from "@/components/Header";
import { PricingPreview } from "@/components/PricingPreview";
import { Footer } from "@/components/Footer";

// "/pricing" is linked from the hero, the footer, locked courses and the CRM upgrade notice.
// Tiers are set by hand by the site admin (no online payment), so the page says how to join.
const Pricing = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
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
