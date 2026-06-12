import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CourseGrid } from "@/components/CourseGrid";
import { CategoryTabs } from "@/components/CategoryTabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export type CourseCategory = "business" | "ai" | "clinic_growth";

export interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  category: CourseCategory;
  min_tier: "free" | "basic" | "premium" | "vip";
  duration_minutes: number | null;
  is_published: boolean;
}

const Courses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CourseCategory | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const { canAccessTier } = useAuth();

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .eq("is_published", true)
      .order("order_index", { ascending: true });

    if (!error && data) {
      setCourses(data as Course[]);
    }
    setIsLoading(false);
  };

  const filteredCourses = selectedCategory === "all" 
    ? courses 
    : courses.filter(course => course.category === selectedCategory);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="py-12 md:py-20">
          <div className="container">
            <div className="text-center mb-12">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                קורסים למטפלים
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                הרחיבו את הידע שלכם בעסק, AI ושיווק הקליניקה
              </p>
            </div>

            <CategoryTabs 
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground text-lg">
                  {courses.length === 0 
                    ? "עדיין אין קורסים זמינים. הקורסים יתווספו בקרוב!"
                    : "אין קורסים בקטגוריה זו"}
                </p>
              </div>
            ) : (
              <CourseGrid 
                courses={filteredCourses}
                canAccessTier={canAccessTier}
              />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Courses;
