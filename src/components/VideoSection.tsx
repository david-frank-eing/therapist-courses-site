import { VideoCard } from "./VideoCard";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const videos = [
  {
    title: "טכניקות CBT מתקדמות לטיפול בחרדה",
    description: "למדו כיצד ליישם טכניקות קוגניטיביות-התנהגותיות מתקדמות בטיפול בהפרעות חרדה",
    thumbnail: "https://images.unsplash.com/photo-1573497620053-ea5300f94f21?w=600&h=400&fit=crop",
    duration: "45:30",
    views: "2,450",
    category: "CBT",
  },
  {
    title: "מיינדפולנס בחדר הטיפולים",
    description: "שילוב תרגילי מיינדפולנס ומדיטציה בפרקטיקה הטיפולית היומיומית",
    thumbnail: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&h=400&fit=crop",
    duration: "32:15",
    views: "1,890",
    category: "מיינדפולנס",
  },
  {
    title: "עבודה עם טראומה: גישת EMDR",
    description: "הכירו את גישת EMDR וכיצד ליישם אותה בטיפול בפוסט טראומה",
    thumbnail: "https://images.unsplash.com/photo-1559757175-5700dde675bc?w=600&h=400&fit=crop",
    duration: "58:00",
    views: "3,120",
    category: "טראומה",
  },
  {
    title: "טיפול במשפחות: מודל בואן",
    description: "היכרות עם התיאוריה המשפחתית של בואן ויישומה בטיפול",
    thumbnail: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=600&h=400&fit=crop",
    duration: "41:20",
    views: "1,560",
    category: "משפחה",
  },
  {
    title: "פסיכודרמה: כלים מעשיים",
    description: "טכניקות פסיכודרמטיות שתוכלו ליישם כבר בפגישה הבאה",
    thumbnail: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&h=400&fit=crop",
    duration: "36:45",
    views: "980",
    category: "פסיכודרמה",
  },
  {
    title: "אתיקה בטיפול: גבולות מקצועיים",
    description: "דיון מעמיק בסוגיות אתיות והתמודדות עם דילמות בעבודה הטיפולית",
    thumbnail: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&h=400&fit=crop",
    duration: "28:10",
    views: "2,230",
    category: "אתיקה",
  },
];

export const VideoSection = () => {
  return (
    <section id="videos" className="py-16 bg-muted/30">
      <div className="container">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10">
          <div>
            <span className="text-primary font-medium text-sm mb-2 block">ספריית הסרטונים</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              סרטונים חדשים וממולצים
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl">
              צפו בסרטונים מקצועיים מהמומחים המובילים בתחום הטיפול והפסיכולוגיה
            </p>
          </div>
          
          <div className="flex items-center gap-2 mt-6 md:mt-0">
            <Button variant="outline" size="icon" className="rounded-full">
              <ChevronRight size={20} />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full">
              <ChevronLeft size={20} />
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video, index) => (
            <div
              key={video.title}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <VideoCard {...video} />
            </div>
          ))}
        </div>
        
        <div className="text-center mt-10">
          <Button variant="default" size="lg" className="px-8">
            לכל הסרטונים בספרייה
          </Button>
        </div>
      </div>
    </section>
  );
};
