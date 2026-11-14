-- Fix 15/11/2026: the plan texts were garbled.
-- The Hebrew in file 7 was read with the wrong encoding when it was pasted into Supabase,
-- so the plan names and texts were saved as gibberish. This file has no Hebrew letters at all:
-- every Hebrew letter is written as its code (U&'D7...'), so it cannot be garbled on the way in.
-- It writes back the original texts for all four plans. Safe to run more than once. Changes only tier_plans.

INSERT INTO public.tier_plans (tier, name, price, tagline, perks, highlighted) VALUES
  ('free', U&'\05D7\05D9\05E0\05DD', 0, U&'\05D4\05EA\05D7\05DC\05D4 \05DE\05D5\05E9\05DC\05DE\05EA',
   jsonb_build_array(U&'\05D2\05D9\05E9\05D4 \05DC\05E7\05D5\05E8\05E1\05D9\05DD \05D1\05E1\05D9\05E1\05D9\05D9\05DD', U&'\05EA\05D5\05DB\05DF AI \05DC\05DE\05EA\05D7\05D9\05DC\05D9\05DD', U&'\05E9\05D0\05DC\05D5\05EA \05D5\05EA\05E9\05D5\05D1\05D5\05EA \05D1\05E7\05D4\05D9\05DC\05D4'), false),
  ('basic', U&'\05D1\05E1\05D9\05E1\05D9', 49, U&'\05DC\05DE\05D8\05E4\05DC \05D4\05DE\05EA\05E4\05EA\05D7',
   jsonb_build_array(U&'\05DB\05DC \05D4\05EA\05DB\05E0\05D9\05DD \05E9\05DC \05D7\05D9\05E0\05DD', U&'\05E7\05D5\05E8\05E1\05D9\05DD \05DE\05EA\05E7\05D3\05DE\05D9\05DD \05D1\05E2\05E1\05E7', U&'\05DB\05DC\05D9 AI \05DE\05EA\05E7\05D3\05DE\05D9\05DD', U&'\05D4\05D5\05E8\05D3\05EA \05D7\05D5\05DE\05E8\05D9\05DD'), false),
  ('premium', U&'\05E4\05E8\05D9\05DE\05D9\05D5\05DD', 99, U&'\05DC\05E6\05DE\05D9\05D7\05D4 \05DE\05D4\05D9\05E8\05D4',
   jsonb_build_array(U&'\05DB\05DC \05D4\05EA\05DB\05E0\05D9\05DD \05E9\05DC \05D1\05E1\05D9\05E1\05D9', U&'\05E7\05D5\05E8\05E1\05D9 \05DE\05D9\05DC\05D5\05D9 \05E7\05DC\05D9\05E0\05D9\05E7\05D4', U&'\05EA\05D1\05E0\05D9\05D5\05EA \05E9\05D9\05D5\05D5\05E7 \05DE\05D5\05DB\05E0\05D5\05EA', U&'\05E9\05D9\05D7\05D5\05EA \05D9\05D9\05E2\05D5\05E5 \05D7\05D5\05D3\05E9\05D9\05D5\05EA'), true),
  ('vip', U&'VIP', 149, U&'\05DC\05D9\05D5\05D5\05D9 \05D0\05D9\05E9\05D9 \05DE\05DC\05D0',
   jsonb_build_array(U&'\05DB\05DC \05D4\05EA\05DB\05E0\05D9\05DD \05E9\05DC \05E4\05E8\05D9\05DE\05D9\05D5\05DD', U&'\05DC\05D9\05D5\05D5\05D9 \05D0\05D9\05E9\05D9 1:1', U&'\05D2\05D9\05E9\05D4 \05DC\05EA\05DB\05E0\05D9\05DD \05D1\05DC\05E2\05D3\05D9\05D9\05DD', U&'\05E7\05D1\05D5\05E6\05EA \05DE\05D0\05E1\05D8\05E8\05DE\05D9\05D9\05E0\05D3'), false)
ON CONFLICT (tier) DO UPDATE SET
  name = EXCLUDED.name, price = EXCLUDED.price, tagline = EXCLUDED.tagline,
  perks = EXCLUDED.perks, highlighted = EXCLUDED.highlighted;

-- check: plan_names should show the four plan names in readable Hebrew (free | basic | premium | VIP)
SELECT string_agg(name, ' | ' ORDER BY array_position(ARRAY['free','basic','premium','vip'], tier)) AS plan_names,
       count(*) AS plans_count
FROM public.tier_plans;
