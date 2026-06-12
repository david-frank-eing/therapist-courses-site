# Therapist Courses Site — Full Export

אתר קורסים למטפלים (מידע עסקי, AI, מילוי קליניקה) עם מערכת מנויים ב-4 רמות.

## Stack
React 18 + Vite 5 + TypeScript 5 + Tailwind v3 + shadcn/ui + Supabase

## התקנה
```bash
npm install
```

## הגדרת Supabase
1. צור פרויקט Supabase חדש ב-https://supabase.com
2. הרץ את ה-SQL מ-`supabase/migrations/` בעורך SQL של הפרויקט (לפי סדר תאריכים)
3. צור קובץ `.env` בשורש:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_ID
```
4. צור ידנית `src/integrations/supabase/client.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = createClient<Database>(URL, KEY, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true }
});
```
5. צור `src/integrations/supabase/types.ts` ע"י: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/integrations/supabase/types.ts`

## הרצה
```bash
npm run dev
```

## מבנה
- `src/pages/` — Index, Auth, Courses, NotFound
- `src/components/` — Header, HeroSection, FeaturedCourses, PricingPreview, CourseGrid, CategoryTabs וכו'
- `src/contexts/AuthContext.tsx` — אימות + בדיקת רמת מנוי
- `src/index.css` + `tailwind.config.ts` — design system (HSL tokens)
- `supabase/migrations/` — סכימת DB + RLS policies

## רמות מנוי
free / basic / premium / vip — נשמרות ב-`profiles.subscription_tier`.
