import type {
  CourseCategory,
  SubscriptionTier,
  ResourceType,
  ListingCategory,
} from "@/integrations/supabase/types";

export const CATEGORY_OPTIONS: { value: CourseCategory; label: string }[] = [
  { value: "business", label: "מידע עסקי" },
  { value: "ai", label: "AI למטפלים" },
  { value: "clinic_growth", label: "מילוי הקליניקה" },
];

export const TIER_OPTIONS: { value: SubscriptionTier; label: string }[] = [
  { value: "free", label: "חינם" },
  { value: "basic", label: "בסיסי" },
  { value: "premium", label: "פרימיום" },
  { value: "vip", label: "VIP" },
];

export const CATEGORY_LABELS: Record<CourseCategory, string> = {
  business: "מידע עסקי",
  ai: "AI למטפלים",
  clinic_growth: "מילוי הקליניקה",
};

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "חינם",
  basic: "בסיסי",
  premium: "פרימיום",
  vip: "VIP",
};

export const RESOURCE_TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: "video", label: "וידאו" },
  { value: "document", label: "מסמך" },
  { value: "presentation", label: "מצגת" },
  { value: "pdf", label: "PDF" },
  { value: "other", label: "אחר" },
];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  video: "וידאו",
  document: "מסמך",
  presentation: "מצגת",
  pdf: "PDF",
  other: "אחר",
};

export const LISTING_CATEGORY_OPTIONS: { value: ListingCategory; label: string }[] = [
  { value: "clinic_room", label: "השכרת חדר קליניקה" },
  { value: "jobs", label: "דרושים / שיתופי פעולה" },
  { value: "workshops", label: "סדנאות ואירועים" },
  { value: "equipment", label: "ציוד למכירה" },
];

export const LISTING_CATEGORY_LABELS: Record<ListingCategory, string> = {
  clinic_room: "השכרת חדר קליניקה",
  jobs: "דרושים / שיתופי פעולה",
  workshops: "סדנאות ואירועים",
  equipment: "ציוד למכירה",
};
