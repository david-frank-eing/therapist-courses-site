import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Lock, Play, Clock, Crown } from "lucide-react";
import type { Course } from "@/pages/Courses";

interface CourseGridProps {
  courses: Course[];
  canAccessTier: (tier: "free" | "basic" | "premium" | "vip") => boolean;
}

const tierLabels: Record<string, string> = {
  free: "חינם",
  basic: "בסיסי",
  premium: "פרימיום",
  vip: "VIP"
};

const tierColors: Record<string, string> = {
  free: "bg-secondary text-secondary-foreground",
  basic: "bg-blue-100 text-blue-700",
  premium: "bg-amber-100 text-amber-700",
  vip: "bg-purple-100 text-purple-700"
};

const categoryLabels: Record<string, string> = {
  business: "מידע עסקי",
  ai: "AI",
  clinic_growth: "מילוי קליניקה"
};

export const CourseGrid = ({ courses, canAccessTier }: CourseGridProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {courses.map((course) => {
        const hasAccess = canAccessTier(course.min_tier);
        
        return (
          <Link
            key={course.id}
            to={hasAccess ? `/course/${course.id}` : "/pricing"}
            className="group"
          >
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
                
                {!hasAccess && (
                  <div className="absolute inset-0 bg-foreground/60 flex items-center justify-center">
                    <div className="text-center text-primary-foreground">
                      <Lock size={32} className="mx-auto mb-2" />
                      <span className="text-sm font-medium">
                        נדרש מנוי {tierLabels[course.min_tier]}
                      </span>
                    </div>
                  </div>
                )}

                <div className="absolute top-3 right-3 flex gap-2">
                  <Badge variant="secondary" className="bg-card/90 backdrop-blur-sm">
                    {categoryLabels[course.category]}
                  </Badge>
                </div>

                {course.min_tier !== "free" && (
                  <Badge 
                    className={`absolute top-3 left-3 ${tierColors[course.min_tier]}`}
                  >
                    <Crown size={12} className="ml-1" />
                    {tierLabels[course.min_tier]}
                  </Badge>
                )}
              </div>

              <CardHeader className="pb-2">
                <h3 className="font-semibold text-lg text-foreground line-clamp-2 group-hover:text-primary transition-smooth">
                  {course.title}
                </h3>
              </CardHeader>

              <CardContent>
                {course.description && (
                  <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
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
        );
      })}
    </div>
  );
};
