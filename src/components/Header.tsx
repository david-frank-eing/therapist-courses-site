import { Menu, X, User, LogOut, Crown, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
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

// up to 5 items: guests see courses / board / pricing; signed-in users see their home first.
// "אודות" and "צור קשר" stay in the footer; "ניהול" moved into the personal menu.
const guestLinks = [
  { label: "קורסים", href: "/courses" },
  { label: "לוח", href: "/board" },
  { label: "מחירים", href: "/pricing" },
];
const memberLinks = [
  { label: "הבית שלי", href: "/home" },
  { label: "קורסים", href: "/courses" },
  { label: "מטופלים", href: "/crm", feature: "clients" as const },
  { label: "לוח", href: "/board" },
];

const tierLabels: Record<string, string> = {
  free: "חינם",
  basic: "בסיסי",
  premium: "פרימיום",
  vip: "VIP"
};

// where "back" goes when there is no earlier page in this tab (opened from a link or a refresh)
const parentOf = (path: string, signedIn: boolean): string => {
  if (path.startsWith("/admin/course/")) return "/admin";
  if (path.startsWith("/course/")) return "/courses";
  if (path.startsWith("/board/")) return "/board";
  if (path.startsWith("/crm/")) return "/crm";
  return signedIn ? "/home" : "/";
};
const NO_BACK = ["/", "/home", "/auth", "/reset-password"];

export const Header = () => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, profile, signOut, isAdmin, hasPaidTools, can } = useAuth();
  const navLinks = user ? memberLinks.filter((l) => !l.feature || can(l.feature)) : guestLinks;
  const navigate = useNavigate();

  const showBack = !NO_BACK.includes(location.pathname);
  const goBack = () => {
    // react-router keeps the position inside this tab's history in history.state.idx
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(parentOf(location.pathname, !!user));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
      <div className="container flex items-center justify-between h-16 md:h-20">
        <Link to={user ? "/home" : "/"} className="flex items-center gap-2" aria-label="לדף הבית">
          <img src="/logo.png" alt="הכול בידיים - מרכז מידע למטפלים במגע" className="h-12 md:h-16 w-auto" />
        </Link>

        {/* Desktop Nav — Dashboard shortcut for premium users */}
        {profile && hasPaidTools && (
          <a
            href="/carlos-dashboard/"
            className="hidden md:flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity ml-2"
          >
            🎛️ דאשבורד
          </a>
        )}

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
                  <Link to="/account" className="cursor-pointer">
                    <User size={16} className="ml-2" />
                    החשבון שלי
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/my-courses" className="cursor-pointer">
                    📚 הקורסים שלי
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="cursor-pointer">⚙️ ניהול</Link>
                  </DropdownMenuItem>
                )}
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
            {profile && hasPaidTools && (
              <a
                href="/carlos-dashboard/"
                onClick={() => setIsMenuOpen(false)}
                className="px-4 py-3 font-medium bg-primary text-primary-foreground rounded-lg text-center"
              >
                🎛️ דאשבורד קרלוס
              </a>
            )}
            <div className="mt-2 pt-2 border-t border-border">
              {user ? (
                <>
                  <Link to="/my-courses" onClick={() => setIsMenuOpen(false)} className="block px-4 py-2 hover:bg-accent rounded-lg">
                    📚 הקורסים שלי
                  </Link>
                  <Link to="/account" onClick={() => setIsMenuOpen(false)} className="block px-4 py-2 hover:bg-accent rounded-lg">
                    👤 החשבון שלי
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setIsMenuOpen(false)}
                      className="block px-4 py-2 text-primary font-medium hover:bg-accent rounded-lg"
                    >
                      ⚙️ ניהול
                    </Link>
                  )}
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
      {showBack && (
        <div className="border-t border-border bg-card/95" data-area="K22">
          <div className="container h-10 flex items-center">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-smooth"
            >
              <ArrowRight size={16} />
              חזרה
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
