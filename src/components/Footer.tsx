import { Mail, Phone, MapPin, Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import { Link } from "react-router-dom";

export const Footer = () => {
  return (
    <footer id="contact" className="bg-foreground text-primary-foreground py-16">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div>
            <Link to="/" className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">מ</span>
              </div>
              <span className="font-bold text-xl">מרחב למטפלים</span>
            </Link>
            <p className="text-primary-foreground/70 mb-6">
              פלטפורמת קורסים מקצועית עבור מטפלים - מידע עסקי, כלי AI, ושיווק הקליניקה.
            </p>
            <div className="flex gap-3">
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-smooth">
                <Facebook size={18} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-smooth">
                <Instagram size={18} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-smooth">
                <Linkedin size={18} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-smooth">
                <Youtube size={18} />
              </a>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold text-lg mb-6">קישורים מהירים</h4>
            <ul className="space-y-3">
              <li><Link to="/" className="text-primary-foreground/70 hover:text-primary transition-smooth">דף הבית</Link></li>
              <li><Link to="/courses" className="text-primary-foreground/70 hover:text-primary transition-smooth">כל הקורסים</Link></li>
              <li><Link to="/pricing" className="text-primary-foreground/70 hover:text-primary transition-smooth">תכניות מנויים</Link></li>
              <li><a href="#about" className="text-primary-foreground/70 hover:text-primary transition-smooth">אודות</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-lg mb-6">קטגוריות</h4>
            <ul className="space-y-3">
              <li><Link to="/courses?category=business" className="text-primary-foreground/70 hover:text-primary transition-smooth">מידע עסקי</Link></li>
              <li><Link to="/courses?category=ai" className="text-primary-foreground/70 hover:text-primary transition-smooth">AI למטפלים</Link></li>
              <li><Link to="/courses?category=clinic_growth" className="text-primary-foreground/70 hover:text-primary transition-smooth">מילוי הקליניקה</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-lg mb-6">צור קשר</h4>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-primary-foreground/70">
                <Mail size={18} className="text-primary" />
                info@therapist-space.co.il
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/70">
                <Phone size={18} className="text-primary" />
                03-1234567
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/70">
                <MapPin size={18} className="text-primary" />
                תל אביב, ישראל
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-primary-foreground/10 pt-8 text-center text-primary-foreground/50 text-sm">
          <p>© 2025 מרחב למטפלים. כל הזכויות שמורות.</p>
        </div>
      </div>
    </footer>
  );
};
