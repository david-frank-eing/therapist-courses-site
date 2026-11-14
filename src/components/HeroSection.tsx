import { Button } from "./ui/button";
import { Link } from "react-router-dom";
import { Play, BookOpen, Briefcase, Bot, TrendingUp } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export const HeroSection = () => {
  const s = useSiteSettings();
  return (
    <section className="relative py-20 md:py-32 overflow-hidden" id="home">
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 right-10 w-32 h-32 md:w-64 md:h-64 bg-brand-orange/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-48 h-48 md:w-96 md:h-96 bg-accent/30 rounded-full blur-3xl" />
      </div>

      <div className="container relative">
        <div className="max-w-6xl mx-auto flex flex-col-reverse md:flex-row items-center gap-10 md:gap-14">
        <div className="flex-1 text-center md:text-right">
          <div className="inline-flex items-center gap-2 bg-secondary rounded-full px-4 py-2 mb-6 animate-fade-in">
            <span className="text-secondary-foreground font-medium">{s.hero_badge}</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground mb-6 leading-tight animate-fade-in">
            {s.hero_title}
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto md:mx-0 animate-fade-in whitespace-pre-wrap">
            {s.hero_subtitle}
          </p>

          <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-12 animate-fade-in">
            <Button size="lg" asChild className="gap-2">
              <Link to="/courses">
                <Play size={20} />
                התחילו ללמוד
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="gap-2">
              <Link to="/pricing">
                <BookOpen size={20} />
                צפו בתכניות המנויים
              </Link>
            </Button>
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap justify-center md:justify-start gap-3 animate-fade-in">
            <div className="flex items-center gap-2 bg-card rounded-full px-4 py-2 shadow-card">
              <Briefcase size={18} className="text-primary" />
              <span className="text-sm font-medium">מידע עסקי</span>
            </div>
            <div className="flex items-center gap-2 bg-card rounded-full px-4 py-2 shadow-card">
              <Bot size={18} className="text-primary" />
              <span className="text-sm font-medium">AI למטפלים</span>
            </div>
            <div className="flex items-center gap-2 bg-card rounded-full px-4 py-2 shadow-card">
              <TrendingUp size={18} className="text-primary" />
              <span className="text-sm font-medium">מילוי הקליניקה</span>
            </div>
          </div>
        </div>

        {/* The logo in an orange ring (the hands are orange, so the logo itself sits on white) */}
        <div className="shrink-0 animate-fade-in" data-area="K43">
          <div className="w-56 h-56 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-full bg-brand-orange p-6 md:p-8 shadow-card-hover">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <img src="/logo.png" alt="הכול בידיים - מרכז מידע למטפלים במגע" className="w-[68%] h-auto" />
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
};
