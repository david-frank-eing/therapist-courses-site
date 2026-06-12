import { Play } from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";

export const FeaturedVideo = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <section className="py-16">
      <div className="container">
        <div className="bg-gradient-to-br from-primary/5 via-accent/20 to-secondary/30 rounded-2xl overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="p-8 lg:p-12">
              <span className="inline-block px-4 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-full mb-6">
                סרטון מומלץ השבוע
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                הכוח של ההקשבה: יסודות הטיפול הממוקד במטופל
              </h2>
              <p className="text-muted-foreground text-lg mb-6">
                ד"ר שרה לוי מציגה את העקרונות המרכזיים של הגישה הרוג'ריאנית 
                וכיצד ליישם הקשבה אמפתית אמיתית בחדר הטיפולים.
              </p>
              <div className="flex flex-wrap gap-4 mb-6 text-sm text-muted-foreground">
                <span className="bg-card px-3 py-1 rounded-full">60 דקות</span>
                <span className="bg-card px-3 py-1 rounded-full">4,500 צפיות</span>
                <span className="bg-card px-3 py-1 rounded-full">ד"ר שרה לוי</span>
              </div>
              <Button size="lg" className="gap-2">
                <Play size={18} className="mr-1" />
                צפייה בסרטון המלא
              </Button>
            </div>
            
            <div className="relative aspect-video lg:aspect-auto lg:h-full min-h-[300px]">
              {!isPlaying ? (
                <div className="absolute inset-0 group cursor-pointer" onClick={() => setIsPlaying(true)}>
                  <img
                    src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=600&fit=crop"
                    alt="Featured video thumbnail"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-foreground/30 group-hover:bg-foreground/40 transition-smooth flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full gradient-hero flex items-center justify-center shadow-xl transform group-hover:scale-110 transition-smooth">
                      <Play size={36} className="text-primary-foreground mr-[-4px]" fill="currentColor" />
                    </div>
                  </div>
                </div>
              ) : (
                <iframe
                  className="w-full h-full absolute inset-0"
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
                  title="Featured Video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
