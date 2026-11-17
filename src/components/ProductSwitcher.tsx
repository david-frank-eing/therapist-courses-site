// The family bar (17/11/2026): the same three pills at the top of the site, Carlos reminders and Carlos finance.
// The active pill is filled with that product's own colour; the orange stays the one brand colour on all three.
// Mirror of public/family-bar.js (used by the two Carlos screens). Change both together.
import { cn } from "@/lib/utils";

type Product = "site" | "reminders" | "finance";

const PRODUCTS: { id: Product; label: string; href: string; active: string }[] = [
  { id: "site", label: "מרחב למטפלים", href: "/home", active: "bg-[#6B2500] text-white" },
  { id: "reminders", label: "תזכורות", href: "/carlos-dashboard/", active: "bg-[#3f5bd6] text-white" },
  { id: "finance", label: "כספים", href: "/carlos-dashboard/#finance", active: "bg-[#1d6647] text-white" },
];

interface Props {
  current?: Product;
  showReminders: boolean;
  showFinance: boolean;
  onNavigate?: () => void;
  className?: string;
}

export const ProductSwitcher = ({ current = "site", showReminders, showFinance, onNavigate, className }: Props) => {
  // a visitor who can only reach the site sees no switcher at all
  if (!showReminders && !showFinance) return null;
  const items = PRODUCTS.filter((p) => p.id === "site" || (p.id === "reminders" ? showReminders : showFinance));
  return (
    <nav
      aria-label="המוצרים של הכול בידיים"
      className={cn("flex items-center gap-1 rounded-full bg-muted p-1", className)}
    >
      {items.map((p) => (
        <a
          key={p.id}
          href={p.href}
          onClick={onNavigate}
          aria-current={p.id === current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-bold transition-colors",
            p.id === current ? p.active : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
        </a>
      ))}
    </nav>
  );
};
