import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// "מה יש בכל דרגה": one place for the tier texts (table tier_plans) and the per-tier capabilities
// (table tier_access). Both are edited in the admin "דרגות" tab. Before the migrations run, the
// defaults below apply, which are exactly what the site showed and enforced until 15/11/2026.

export type Tier = "free" | "basic" | "premium" | "vip";
export type Feature = "clients" | "tasks" | "booking" | "content";

export const TIERS: Tier[] = ["free", "basic", "premium", "vip"];

export const FEATURES: { id: Feature; label: string; note: string }[] = [
  { id: "clients", label: "ניהול מטופלים", note: "רשימת המטופלים, כרטיס מטופל, לקוחות ואירועים" },
  { id: "tasks", label: "תזכורות ומשימות", note: "משימות, הרגלים, תכנון יומי ושבועי, יומן אישי" },
  { id: "booking", label: "זימון תורים", note: "דף הזמנת תור ציבורי וניהול הזימונים" },
  { id: "content", label: "תוכן ופרסום", note: "תכנון התוכן השבועי ויומן הפרסום" },
];

export interface TierPlan {
  tier: Tier;
  name: string;
  price: number;
  tagline: string;
  perks: string[];
  highlighted: boolean;
}

export const DEFAULT_PLANS: TierPlan[] = [
  { tier: "free", name: "חינם", price: 0, tagline: "התחלה מושלמת", highlighted: false,
    perks: ["גישה לקורסים בסיסיים", "תוכן AI למתחילים", "שאלות ותשובות בקהילה"] },
  { tier: "basic", name: "בסיסי", price: 49, tagline: "למטפל המתפתח", highlighted: false,
    perks: ["כל התכנים של חינם", "קורסים מתקדמים בעסק", "כלי AI מתקדמים", "הורדת חומרים"] },
  { tier: "premium", name: "פרימיום", price: 99, tagline: "לצמיחה מהירה", highlighted: true,
    perks: ["כל התכנים של בסיסי", "קורסי מילוי קליניקה", "תבניות שיווק מוכנות", "שיחות ייעוץ חודשיות"] },
  { tier: "vip", name: "VIP", price: 149, tagline: "ליווי אישי מלא", highlighted: false,
    perks: ["כל התכנים של פרימיום", "ליווי אישי 1:1", "גישה לתכנים בלעדיים", "קבוצת מאסטרמיינד"] },
];

export interface AccessRow { feature: string; tier: string; allowed: boolean }

/** the rule the database uses too (has_feature): own row, else the old "paid_tools" row, else premium/vip */
export const isAllowed = (rows: AccessRow[], feature: Feature, tier: string): boolean => {
  const find = (f: string) => rows.find((r) => r.feature === f && r.tier === tier);
  return (find(feature) ?? find("paid_tools"))?.allowed ?? ["premium", "vip"].includes(tier);
};

/** true once the "tier features" migration ran: the four capabilities have their own rows */
export const featuresSplit = (rows: AccessRow[]): boolean => rows.some((r) => r.feature === "clients");

export interface TierData {
  plans: TierPlan[];
  access: AccessRow[];
  plansReady: boolean | null; // null = loading, false = the tier_plans table does not exist yet
  accessReady: boolean | null;
}

const EMPTY: TierData = { plans: DEFAULT_PLANS, access: [], plansReady: null, accessReady: null };

let cache: TierData | null = null;
let pending: Promise<TierData> | null = null;
const listeners = new Set<(d: TierData) => void>();

const normalise = (rows: any[]): TierPlan[] =>
  DEFAULT_PLANS.map((d) => {
    const r = rows.find((x) => x.tier === d.tier);
    if (!r) return d;
    return {
      tier: d.tier,
      name: r.name || d.name,
      price: Number.isFinite(Number(r.price)) ? Number(r.price) : d.price,
      tagline: r.tagline ?? "",
      perks: Array.isArray(r.perks) ? r.perks.filter((p: unknown) => typeof p === "string") : d.perks,
      highlighted: !!r.highlighted,
    };
  });

export const loadTierData = (force = false): Promise<TierData> => {
  if (cache && !force) return Promise.resolve(cache);
  if (pending && !force) return pending;
  const db = supabase as any;
  pending = Promise.all([
    db.from("tier_plans").select("tier,name,price,tagline,perks,highlighted"),
    db.from("tier_access").select("feature,tier,allowed"),
  ])
    .then(([p, a]: any[]) => {
      cache = {
        plans: p.error || !p.data ? DEFAULT_PLANS : normalise(p.data),
        access: a.error || !a.data ? [] : a.data,
        plansReady: !p.error,
        accessReady: !a.error,
      };
      return cache;
    })
    .catch(() => {
      cache = { ...EMPTY, plansReady: false, accessReady: false };
      return cache;
    })
    .then((d: TierData) => {
      pending = null;
      listeners.forEach((l) => l(d));
      return d;
    });
  return pending;
};

/** the admin tab pushes its edits here so every open page shows them without a reload */
export const setTierData = (patch: Partial<TierData>) => {
  cache = { ...(cache ?? EMPTY), ...patch };
  listeners.forEach((l) => l(cache as TierData));
};

export const useTierData = (): TierData => {
  const [data, setData] = useState<TierData>(cache ?? EMPTY);
  useEffect(() => {
    listeners.add(setData);
    loadTierData().then(setData);
    return () => { listeners.delete(setData); };
  }, []);
  return data;
};

/** the display name of a tier: what the admin typed in "דרגות", else the built-in name */
export const tierName = (plans: TierPlan[], tier: string | null | undefined): string =>
  plans.find((p) => p.tier === tier)?.name || tier || "—";
