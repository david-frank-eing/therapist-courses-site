import { useEffect } from "react";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { FeaturedCourses } from "@/components/FeaturedCourses";
import { WorkshopSection, AboutDavidSection } from "@/components/WorkshopSection";
import { AboutSection } from "@/components/AboutSection";
import { WorkshopPopup } from "@/components/WorkshopPopup";
import { Footer } from "@/components/Footer";

const Index = () => {
  // "/#about" from another page: the section only exists after this page renders, so scroll to it here
  useEffect(() => {
    if (!window.location.hash) return;
    const t = setTimeout(() => document.querySelector(window.location.hash)?.scrollIntoView({ behavior: "smooth" }), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <WorkshopSection />
        <AboutDavidSection />
        <FeaturedCourses />
        <AboutSection />
      </main>
      <Footer />
      <WorkshopPopup />
    </div>
  );
};

export default Index;
