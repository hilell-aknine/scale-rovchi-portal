-- ============================================================
-- 0006 · סקייל רווחי — פופאפ הנעה-לפעולה בסיום שיעור
-- ============================================================
-- טבלה אחת (lesson_cta_popup) שהאדמין שולט בה. מוצגת למשתמש
-- כשהוא לוחץ "סיימתי את השיעור".
--
-- ⚖️ אבטחה:
--   • anon/authenticated — קריאה (SELECT) רק כאשר active = true
--     (כדי שדף השיעור יוכל לשלוף את הפופאפ הפעיל עם anon key).
--   • ניהול מלא (ALL) — רק ל-is_admin() (אדמין מאומת בדשבורד).
--   • אין anon write — RLS חוסם כל INSERT/UPDATE/DELETE שאינו אדמין.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- is_admin() — ❌ לא מגדירים כאן! כבר קיים בחשבון החי ומאובטח:
--   select exists(select 1 from public.app_admin where email = auth.jwt()->>'email')
-- הגדרה מחדש כאן הייתה דורסת אותו בגרסה פרוצה (auth.uid() is not null = כל מאומת).
-- ה-policies למטה מסתמכים על public.is_admin() הקיים.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- lesson_cta_popup — פופאפ ההנעה-לפעולה (שורה אחת פעילה בכל רגע).
-- ------------------------------------------------------------
create table if not exists public.lesson_cta_popup (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  body          text,
  button_label  text,
  button_url    text,
  active         boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.lesson_cta_popup enable row level security;

drop policy if exists "cta popup public read active"  on public.lesson_cta_popup;
drop policy if exists "cta popup admin manage"         on public.lesson_cta_popup;

-- קריאה ציבורית רק לפופאפ פעיל (להצגה בדף השיעור עם anon key)
create policy "cta popup public read active"
  on public.lesson_cta_popup for select
  to anon, authenticated
  using (active = true);

-- ניהול מלא — אדמין בלבד
create policy "cta popup admin manage"
  on public.lesson_cta_popup for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- הרשאות טבלה (RLS עדיין שולט בשורות בפועל)
-- ------------------------------------------------------------
grant select on public.lesson_cta_popup to anon, authenticated;

-- ============================================================
-- Seed — שורה ברירת-מחדל אחת כדי שיהיה מה לערוך מיד.
-- ============================================================
insert into public.lesson_cta_popup (title, body, button_label, button_url, active)
select
  'כל הכבוד! סיימת עוד שיעור 🎉',
  'אתה צובר תאוצה. רוצה לקחת את זה צעד קדימה? בוא נדבר על איך מיישמים את זה בעסק שלך.',
  'דברו איתי',
  'https://wa.me/972549116092',
  false
where not exists (select 1 from public.lesson_cta_popup);
