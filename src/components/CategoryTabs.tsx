import { Briefcase, Bot, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseCategory } from "@/pages/Courses";

interface CategoryTabsProps {
  selectedCategory: CourseCategory | "all";
  onSelectCategory: (category: CourseCategory | "all") => void;
}

const categories = [
  { id: "all" as const, label: "הכל", icon: null },
  { id: "business" as const, label: "מידע עסקי", icon: Briefcase },
  { id: "ai" as const, label: "AI למטפלים", icon: Bot },
  { id: "clinic_growth" as const, label: "מילוי הקליניקה", icon: TrendingUp },
];

export const CategoryTabs = ({ selectedCategory, onSelectCategory }: CategoryTabsProps) => {
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-10">
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onSelectCategory(category.id)}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-smooth",
            selectedCategory === category.id
              ? "bg-primary text-primary-foreground shadow-card"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-border"
          )}
        >
          {category.icon && <category.icon size={18} />}
          {category.label}
        </button>
      ))}
    </div>
  );
};
