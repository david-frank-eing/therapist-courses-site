import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { FeaturedCourses } from "@/components/FeaturedCourses";
import { AboutSection } from "@/components/AboutSection";
import { PricingPreview } from "@/components/PricingPreview";
import { Footer } from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <FeaturedCourses />
        <AboutSection />
        <PricingPreview />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
