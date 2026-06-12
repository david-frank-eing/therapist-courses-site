import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ArrowLeft, Play, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  category: string;
  duration_minutes: number | null;
}

const categoryLabels: Record<string, string> = {
  business: "מידע עסקי",
  ai: "AI",
  clinic_growth: "מילוי קליניקה"
};

export const FeaturedCourses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, description, thumbnail_url, category, duration_minutes")
      .eq("is_published", true)
      .eq("min_tier", "free")
      .order("order_index", { ascending: true })
      .limit(3);

    if (!error && data) {
      setCourses(data);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <section className="py-16 bg-secondary/30">
        <div className="container flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  if (courses.length === 0) {
    return null;
  }

  return (
    <section className="py-16 md:py-24 bg-secondary/30">
      <div className="container">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              קורסים מומלצים
            </h2>
            <p className="text-muted-foreground">
              התחילו ללמוד בחינם
            </p>
          </div>
          <Button variant="ghost" asChild className="hidden md:flex gap-2">
            <Link to="/courses">
              לכל הקורסים
              <ArrowLeft size={18} />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Link key={course.id} to={`/course/${course.id}`} className="group">
              <Card className="overflow-hidden shadow-card hover:shadow-card-hover transition-smooth h-full">
                <div className="relative aspect-video bg-muted overflow-hidden">
                  {course.thumbnail_url ? (
                    <img
                      src={course.thumbnail_url}
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-smooth"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                      <Play size={48} className="text-primary/50" />
                    </div>
                  )}
                  <Badge className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm text-foreground">
                    {categoryLabels[course.category] || course.category}
                  </Badge>
                </div>

                <CardHeader className="pb-2">
                  <h3 className="font-semibold text-lg text-foreground line-clamp-2 group-hover:text-primary transition-smooth">
                    {course.title}
                  </h3>
                </CardHeader>

                <CardContent>
                  {course.description && (
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
                      {course.description}
                    </p>
                  )}
                  {course.duration_minutes && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock size={14} />
                      <span>{course.duration_minutes} דקות</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8 md:hidden">
          <Button asChild>
            <Link to="/courses">לכל הקורסים</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
