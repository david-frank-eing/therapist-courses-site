import { Calendar, MapPin, Users } from "lucide-react";
import { Button } from "./ui/button";

interface CourseCardProps {
  title: string;
  description: string;
  image: string;
  date: string;
  location: string;
  participants: number;
}

export const CourseCard = ({
  title,
  description,
  image,
  date,
  location,
  participants,
}: CourseCardProps) => {
  return (
    <div className="bg-card rounded-xl overflow-hidden shadow-card hover:shadow-card-hover transition-smooth group">
      <div className="relative h-48 overflow-hidden">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-smooth"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
        <div className="absolute bottom-4 right-4 left-4">
          <span className="text-primary-foreground text-sm flex items-center gap-2">
            <Calendar size={14} />
            {date}
          </span>
        </div>
      </div>
      
      <div className="p-5">
        <h3 className="font-bold text-lg text-foreground mb-2 group-hover:text-primary transition-smooth">
          {title}
        </h3>
        <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
          {description}
        </p>
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <span className="flex items-center gap-1">
            <MapPin size={14} />
            {location}
          </span>
          <span className="flex items-center gap-1">
            <Users size={14} />
            {participants} משתתפים
          </span>
        </div>
        
        <Button variant="outline" className="w-full">
          למידע והרשמה
        </Button>
      </div>
    </div>
  );
};
