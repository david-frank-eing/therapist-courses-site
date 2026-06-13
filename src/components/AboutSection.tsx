import { useSiteSettings } from "@/hooks/useSiteSettings";

export const AboutSection = () => {
  const s = useSiteSettings();

  if (!s.about_title && !s.about_text) return null;

  return (
    <section id="about" className="py-16 md:py-24 bg-muted/30">
      <div className="container">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            {s.about_title}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {s.about_text}
          </p>
        </div>
      </div>
    </section>
  );
};
