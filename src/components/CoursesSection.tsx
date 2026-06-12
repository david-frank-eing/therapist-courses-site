import { CourseCard } from "./CourseCard";
import { Button } from "./ui/button";

const courses = [
  {
    title: "קורס מתקדם בטיפול קוגניטיבי-התנהגותי",
    description: "קורס מקיף של 12 מפגשים להעמקת הידע והמיומנויות בגישת CBT",
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop",
    date: "15.01.2026",
    location: "תל אביב",
    participants: 24,
  },
  {
    title: "סדנת התמודדות עם שחיקה מקצועית",
    description: "כלים מעשיים לשמירה על הבריאות הנפשית של המטפל ומניעת שחיקה",
    image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop",
    date: "22.01.2026",
    location: "זום",
    participants: 45,
  },
  {
    title: "טיפול בילדים ונוער: גישות עדכניות",
    description: "למדו את הגישות החדשות והעדכניות ביותר לטיפול באוכלוסיית הצעירים",
    image: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600&h=400&fit=crop",
    date: "05.02.2026",
    location: "ירושלים",
    participants: 18,
  },
];

export const CoursesSection = () => {
  return (
    <section id="courses" className="py-16">
      <div className="container">
        <div className="text-center mb-12">
          <span className="text-primary font-medium text-sm mb-2 block">קורסים וסדנאות</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            המלצות על קורסים חדשים
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            הרחיבו את הידע והכישורים המקצועיים שלכם עם הקורסים והסדנאות האיכותיים ביותר
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course, index) => (
            <div
              key={course.title}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CourseCard {...course} />
            </div>
          ))}
        </div>
        
        <div className="text-center mt-10">
          <Button variant="default" size="lg" className="px-8">
            לכל הקורסים והסדנאות
          </Button>
        </div>
      </div>
    </section>
  );
};
