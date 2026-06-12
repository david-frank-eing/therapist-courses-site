import { FileText, Download, BookOpen, Headphones } from "lucide-react";
import { Button } from "./ui/button";

const resources = [
  {
    icon: FileText,
    title: "מאמרים מקצועיים",
    description: "מאמרים ומחקרים עדכניים בתחום הטיפול והפסיכולוגיה",
    count: "120+",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Download,
    title: "חומרים להורדה",
    description: "שאלונים, דפי עבודה וכלים מעשיים לעבודה עם מטופלים",
    count: "85+",
    color: "bg-accent text-accent-foreground",
  },
  {
    icon: BookOpen,
    title: "ספרים מומלצים",
    description: "רשימת ספרים מומלצים מחולקת לפי תחומי התמחות",
    count: "200+",
    color: "bg-secondary text-secondary-foreground",
  },
  {
    icon: Headphones,
    title: "פודקאסטים",
    description: "פרקי פודקאסט עם מומחים מובילים בתחום בריאות הנפש",
    count: "50+",
    color: "bg-muted text-foreground",
  },
];

export const ResourcesSection = () => {
  return (
    <section id="resources" className="py-16 bg-muted/30">
      <div className="container">
        <div className="text-center mb-12">
          <span className="text-primary font-medium text-sm mb-2 block">משאבים מקצועיים</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            כל מה שצריך במקום אחד
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            גישה למגוון רחב של משאבים מקצועיים שיעזרו לכם בעבודה היומיומית
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {resources.map((resource, index) => (
            <div
              key={resource.title}
              className="bg-card rounded-xl p-6 shadow-card hover:shadow-card-hover transition-smooth text-center group animate-fade-in cursor-pointer"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className={`w-16 h-16 ${resource.color} rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-smooth`}>
                <resource.icon size={28} />
              </div>
              <span className="text-3xl font-bold text-primary block mb-2">{resource.count}</span>
              <h3 className="font-bold text-lg text-foreground mb-2">{resource.title}</h3>
              <p className="text-muted-foreground text-sm">{resource.description}</p>
            </div>
          ))}
        </div>
        
        <div className="text-center mt-10">
          <Button variant="outline" size="lg" className="px-8">
            לכל המשאבים
          </Button>
        </div>
      </div>
    </section>
  );
};
