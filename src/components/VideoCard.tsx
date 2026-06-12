import { Play, Clock, Eye } from "lucide-react";

interface VideoCardProps {
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  views: string;
  category: string;
  videoUrl?: string;
}

export const VideoCard = ({
  title,
  description,
  thumbnail,
  duration,
  views,
  category,
}: VideoCardProps) => {
  return (
    <div className="group bg-card rounded-xl overflow-hidden shadow-card hover:shadow-card-hover transition-smooth cursor-pointer">
      <div className="relative aspect-video overflow-hidden">
        <img
          src={thumbnail}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-smooth"
        />
        <div className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/40 transition-smooth flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="w-16 h-16 rounded-full gradient-hero flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-smooth">
            <Play size={28} className="text-primary-foreground mr-[-2px]" fill="currentColor" />
          </div>
        </div>
        <span className="absolute top-3 right-3 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
          {category}
        </span>
        <span className="absolute bottom-3 left-3 px-2 py-1 bg-foreground/80 text-primary-foreground text-xs rounded flex items-center gap-1">
          <Clock size={12} />
          {duration}
        </span>
      </div>
      
      <div className="p-5">
        <h3 className="font-bold text-lg text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-smooth">
          {title}
        </h3>
        <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
          {description}
        </p>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye size={14} />
            {views} צפיות
          </span>
          <span className="text-primary font-medium hover:underline">
            צפייה בסרטון ←
          </span>
        </div>
      </div>
    </div>
  );
};
