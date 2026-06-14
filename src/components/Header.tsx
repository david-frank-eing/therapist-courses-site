import { Menu, X, User, LogOut, Crown } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Badge } from "./ui/badge";

const navLinks = [
  { label: "דף הבית", href: "/" },
  { label: "קורסים", href: "/courses" },
  { label: "לוח מודעות", href: "/board" },
  { label: "אודות", href: "#about" },
  { label: "צור קשר", href: "#contact" },
];

const tierLabels: Record<string, string> = {
  free: "חינם",
  basic: "בסיסי",
  premium: "פרימיום",
  vip: "VIP"
};

export const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, profile, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
      <div className="container flex items-center justify-between h-16 md:h-20">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xl">מ</span>
          </div>
          <span className="font-bold text-xl text-foreground">מרחב למטפלים</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            link.href.startsWith("/") ? (
              <Link
                key={link.href}
                to={link.href}
                className="px-4 py-2 text-muted-foreground hover:text-primary transition-smooth rounded-lg hover:bg-accent"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-muted-foreground hover:text-primary transition-smooth rounded-lg hover:bg-accent"
              >
                {link.label}
              </a>
            )
          ))}
          {user && (
            <Link
              to="/crm"
              className="px-4 py-2 text-muted-foreground hover:text-primary transition-smooth rounded-lg hover:bg-accent"
            >
              המטופלים שלי
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/admin"
              className="px-4 py-2 text-primary font-medium hover:text-primary/80 transition-smooth rounded-lg hover:bg-accent"
            >
              ניהול
            </Link>
          )}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <User size={18} />
                  <span>{profile?.full_name || "המשתמש שלי"}</span>
                  {profile?.subscription_tier && profile.subscription_tier !== "free" && (
                    <Badge variant="secondary" className="mr-1">
                      <Crown size={12} className="ml-1" />
                      {tierLabels[profile.subscription_tier]}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="cursor-pointer">
                    <User size={16} className="ml-2" />
                    הפרופיל שלי
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/my-courses" className="cursor-pointer">
                    📚 הקורסים שלי
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                  <LogOut size={16} className="ml-2" />
                  התנתקות
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/auth">התחברות</Link>
              </Button>
              <Button asChild>
                <Link to="/auth">הרשמה</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 text-foreground"
          aria-label="תפריט"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {isMenuOpen && (
        <nav className="md:hidden bg-card border-t border-border animate-fade-in">
          <div className="container py-4 flex flex-col gap-2">
            {navLinks.map((link) => (
              link.href.startsWith("/") ? (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="px-4 py-3 text-foreground hover:text-primary hover:bg-accent rounded-lg transition-smooth"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="px-4 py-3 text-foreground hover:text-primary hover:bg-accent rounded-lg transition-smooth"
                >
                  {link.label}
                </a>
              )
            ))}
            {user && (
              <Link
                to="/crm"
                onClick={() => setIsMenuOpen(false)}
                className="px-4 py-3 text-foreground hover:text-primary hover:bg-accent rounded-lg transition-smooth"
              >
                המטופלים שלי
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setIsMenuOpen(false)}
                className="px-4 py-3 text-primary font-medium hover:bg-accent rounded-lg transition-smooth"
              >
                ניהול
              </Link>
            )}
            <div className="mt-2 pt-2 border-t border-border">
              {user ? (
                <>
                  <div className="px-4 py-2 text-sm text-muted-foreground">
                    {profile?.full_name || user.email}
                    {profile?.subscription_tier && profile.subscription_tier !== "free" && (
                      <Badge variant="secondary" className="mr-2">
                        {tierLabels[profile.subscription_tier]}
                      </Badge>
                    )}
                  </div>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-destructive"
                    onClick={() => {
                      handleSignOut();
                      setIsMenuOpen(false);
                    }}
                  >
                    <LogOut size={16} className="ml-2" />
                    התנתקות
                  </Button>
                </>
              ) : (
                <Button className="w-full" asChild>
                  <Link to="/auth" onClick={() => setIsMenuOpen(false)}>
                    התחברות / הרשמה
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
};
