# QA + Security Review — Therapist Courses Platform

**Date:** 2026-06-13
**Branch:** main
**Mode:** Source-level QA + security review (browser harness unavailable on Windows)
**Reviewed against:** security-and-hardening (OWASP), best-practices checklists
**Live URL:** https://stupendous-lily-f8cd84.netlify.app
**Supabase project:** oxxjibriplesmrnklmaf

---

## Health Score: 52 / 100

The app works. It loads, auth flows function, the admin panel and course pages render, secrets are handled correctly. But the **paywall is not actually enforced** — two access-control holes let any free user obtain paid content, and one of them lets a user silently promote themselves to VIP. For a product whose entire business model is tiered access, that's the headline.

Everything below is fixable, mostly in SQL.

---

## Findings (severity-ranked)

### ISSUE-001 — CRITICAL — Users can upgrade their own subscription tier for free

**Where:** `profiles` RLS policy "Users can update their own profile" (first migration)

```sql
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
```

The policy gates *which row* a user can update (their own) but not *which columns*. `subscription_tier` lives on that same row. So any logged-in user can run, from the browser console:

```js
await supabase.from('profiles').update({ subscription_tier: 'vip' }).eq('id', MY_ID)
```

...and instantly become VIP. `canAccessTier()` then unlocks everything. The tier IS the access control, and the user controls the tier. This voids the paywall completely.

**Fix:** Block non-admin changes to `subscription_tier` (and `subscription_expires_at`) with a BEFORE UPDATE trigger, or move tier to a table users can't write. SQL provided below.

---

### ISSUE-002 — HIGH — Tier gating on files/videos is client-side only; bypassable

**Where:** `course_resources` + `videos` SELECT policies, storage policy "Authenticated users can read course files", gating in `src/pages/CoursePage.tsx`

The published-content policies expose every row's `file_path` / `video_url` regardless of tier:

```sql
CREATE POLICY "Anyone can view published resource metadata"
  ON public.course_resources FOR SELECT USING (is_published = true);
```

And the storage policy lets any authenticated user read any object in the bucket:

```sql
CREATE POLICY "Authenticated users can read course files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-files' AND auth.uid() IS NOT NULL);
```

So a free-tier user can: (1) read the `file_path` of a VIP-only resource straight from the table, (2) call `createSignedUrl(file_path, 60)`, (3) download it. The `canAccessTier()` check in CoursePage.tsx only hides the button — it doesn't stop the request. Same logic applies to `video_url`.

**Fix:** Enforce tier in the storage SELECT policy by joining path → `course_resources.min_tier` → caller's `profiles.subscription_tier`. (More involved; see notes.) At minimum, fixing ISSUE-001 stops the trivial "make myself VIP" path.

---

### ISSUE-003 — MEDIUM — No security headers (CSP, X-Frame-Options, etc.)

**Where:** Netlify response headers

Live site returns only `Strict-Transport-Security` (Netlify default). Missing: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. The site is currently frameable (clickjacking risk) and has no CSP.

**Fix:** Add a `public/_headers` file (Netlify reads it). Provided below.

---

### ISSUE-004 — LOW — Email confirmation disabled

**Where:** Supabase Auth → Providers → Email ("Confirm email" off)

Anyone can register with any email — including one they don't own — and it's treated as confirmed. We turned this off deliberately to get unblocked, and it's acceptable for an MVP, but it means emails aren't verified. Revisit before charging money / sending transactional mail. Pairs with setting up real SMTP (Resend).

---

### ISSUE-005 — LOW — File upload validation is client-only

**Where:** `src/components/admin/ResourceManagerDialog.tsx:307-312`

The `accept="..."` attribute is a UI hint, trivially bypassed. No server-side size/MIME enforcement. Risk is low because uploads are admin-only, but a huge file or unexpected type isn't blocked.

---

## What's GOOD (verified)

- `.env` is gitignored and was **never** committed — confirmed via `git ls-files` and `git log -p`.
- No hardcoded secrets in `src/`. Only `.env.example` carries a placeholder. Correct.
- `service_role` key was never introduced anywhere. Correct — it must never reach the client.
- `client.ts` throws clearly if env vars are missing. Good DX.
- RLS is enabled on every table; admin checks use a `SECURITY DEFINER has_role()` to avoid policy recursion. Solid pattern.
- Passwords handled entirely by Supabase Auth (bcrypt). No DIY crypto.
- HTTPS enforced (HSTS, preload).

---

## Top 3 to fix

1. **ISSUE-001** (critical) — stop self-serve tier upgrades. ~5 min of SQL.
2. **ISSUE-002** (high) — enforce file/video gating server-side.
3. **ISSUE-003** (medium) — add `public/_headers`. ~2 min.

## Fix status

All findings reported. No fixes applied yet — awaiting user go-ahead (ISSUE-001/002 require running SQL in the Supabase dashboard, which is user-driven; ISSUE-003/005 can be code commits).
