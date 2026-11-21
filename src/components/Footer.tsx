import { Mail, Phone, MapPin, Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export const Footer = () => {
  const s = useSiteSettings();
  const socials = [
    { href: s.social_facebook, Icon: Facebook, label: "Facebook" },
    { href: s.social_instagram, Icon: Instagram, label: "Instagram" },
    { href: s.social_linkedin, Icon: Linkedin, label: "LinkedIn" },
    { href: s.social_youtube, Icon: Youtube, label: "YouTube" },
  ].filter((x) => x.href);

  return (
    <footer id="contact" className="bg-foreground text-primary-foreground py-16 border-t-4 border-brand-orange">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div>
            <Link to="/" className="flex items-center gap-2 mb-6">
              <span className="w-28 h-28 rounded-full bg-brand-orange p-2 inline-flex shrink-0"><span className="w-full h-full rounded-full bg-white flex items-center justify-center"><img src="/logo.png" alt="הכול בידיים - מרכז מידע למטפלים במגע" className="w-[72%] h-auto" /></span></span>
            </Link>
            <p className="text-primary-foreground/70 mb-6">
              הצד העסקי של הקליניקה: מידע עסקי, כלי AI ושיווק, בעברית ובשפה פשוטה.
            </p>
            {socials.length > 0 && (
              <div className="flex gap-3">
                {socials.map(({ href, Icon, label }) => (
                  <a
                    key={label}
                    href={href as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-10 h-10 rounded-full bg-primary-foreground/10 hover:bg-brand-orange hover:text-foreground flex items-center justify-center transition-smooth"
                  >
                    <Icon size={18} />
                  </a>
                ))}
              </div>
            )}
          </div>
          
          <div>
            <h4 className="font-bold text-lg mb-6">קישורים מהירים</h4>
            <ul className="space-y-3">
              <li><Link to="/" className="text-primary-foreground/70 hover:text-brand-orange transition-smooth">דף הבית</Link></li>
              <li><Link to="/courses" className="text-primary-foreground/70 hover:text-brand-orange transition-smooth">כל הקורסים</Link></li>
              <li><Link to="/pricing" className="text-primary-foreground/70 hover:text-brand-orange transition-smooth">תכניות מנויים</Link></li>
              <li><a href="/#about" className="text-primary-foreground/70 hover:text-brand-orange transition-smooth">אודות</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-lg mb-6">קטגוריות</h4>
            <ul className="space-y-3">
              <li><Link to="/courses?category=business" className="text-primary-foreground/70 hover:text-brand-orange transition-smooth">מידע עסקי</Link></li>
              <li><Link to="/courses?category=ai" className="text-primary-foreground/70 hover:text-brand-orange transition-smooth">AI למטפלים</Link></li>
              <li><Link to="/courses?category=clinic_growth" className="text-primary-foreground/70 hover:text-brand-orange transition-smooth">מילוי הקליניקה</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-lg mb-6">צור קשר</h4>
            <ul className="space-y-4">
              <li>
                <a
                  href={`mailto:${s.contact_email}`}
                  className="flex items-center gap-3 text-primary-foreground/70 hover:text-brand-orange transition-smooth"
                  dir="ltr"
                >
                  <Mail size={18} className="text-brand-orange shrink-0" />
                  {s.contact_email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${s.contact_phone}`}
                  className="flex items-center gap-3 text-primary-foreground/70 hover:text-brand-orange transition-smooth"
                  dir="ltr"
                >
                  <Phone size={18} className="text-brand-orange shrink-0" />
                  {s.contact_phone}
                </a>
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/70">
                <MapPin size={18} className="text-brand-orange shrink-0" />
                {s.contact_address}
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-primary-foreground/10 pt-8 text-center text-primary-foreground/50 text-sm">
          <p>© {new Date().getFullYear()} הכול בידיים · מרחב למטפלים. כל הזכויות שמורות.</p>
        </div>
      </div>
    </footer>
  );
};
