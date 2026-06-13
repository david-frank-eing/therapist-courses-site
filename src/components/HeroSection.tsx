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
        <div className="absolute top-20 right-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl" />
      </div>

      <div className="container relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-secondary/50 rounded-full px-4 py-2 mb-6 animate-fade-in">
            <span className="text-primary font-medium">{s.hero_badge}</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight animate-fade-in">
            {s.hero_title}
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-fade-in whitespace-pre-wrap">
            {s.hero_subtitle}
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-12 animate-fade-in">
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
          <div className="flex flex-wrap justify-center gap-3 animate-fade-in">
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
      </div>
    </section>
  );
};
