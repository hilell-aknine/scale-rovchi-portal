/* ============================================================
 * סקייל רווחי — המשפך החינמי | שכבת נתונים (supabase-client.js)
 * ============================================================
 * חושף API גלובלי אחד: window.portalData עם כל הפונקציות (async).
 *
 * שני מצבים:
 *   1) LIVE  — ברירת המחדל. קריאות אמיתיות ל-Supabase של רותם.
 *              ⚖️ קריאות (SELECT) ישירות עם anon key (תוכן/התקדמות/
 *                 נקודות/לוח-מובילים — קריאה בלבד, מוגן ב-RLS).
 *              ⚖️ כתיבות (ליד/שאלון/התקדמות/נקודות/גישה) עוברות אך ורק
 *                 דרך Edge Functions ב-service_role. אין anon INSERT.
 *   2) MOCK  — נתוני דמה מקומיים. נכנס אוטומטית אם המפתחות עדיין TODO,
 *              או ידנית: localStorage.setItem('sr_force_mock','1').
 *
 * 🔑 ה-anon key הוא מפתח ציבורי מתוכנן (נשלח לכל דפדפן) — לא סוד.
 *    הסודות האמיתיים (service_role/Turnstile/חתימת טוקן) יושבים
 *    רק בשרת (supabase secrets) ולעולם לא כאן.
 *
 * זהות: viewer_id = מייל המשתמש, ב-localStorage תחת 'sr_user_email'.
 * גישה: טוקן חתום מ-grant-access, ב-localStorage תחת 'sr_access_token'
 *       (מחליף את הדגל הישן הניתן-לזיוף 'scale_revachi_portal_access').
 *
 * דורש (ב-LIVE) את ה-CDN של supabase-js לפני הקובץ הזה:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 * ============================================================ */

(function () {
  'use strict';

  // --- חיבור ל-Supabase של רותם (project ref: mcpprxujlgpdkgnjjunf) ---
  // ה-anon key ציבורי ובטוח להטמעה בקוד צד-לקוח.
  const SUPABASE_URL = 'https://mcpprxujlgpdkgnjjunf.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jcHByeHVqbGdwZGtnbmpqdW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzM3ODIsImV4cCI6MjA5NzM0OTc4Mn0.rTgP-j2smBjzV4ixT7Ea0I0leOAErVLN5F5aULDNHM4';

  const EMAIL_KEY = 'sr_user_email';
  const TOKEN_KEY = 'sr_access_token';

  // MOCK אם המפתחות לא הושלמו, או אם נכפה ידנית.
  function forcedMock() {
    try { return localStorage.getItem('sr_force_mock') === '1'; } catch (e) { return false; }
  }
  const IS_MOCK = SUPABASE_URL.indexOf('__TODO__') !== -1 ||
                  SUPABASE_ANON_KEY.indexOf('__TODO__') !== -1 ||
                  forcedMock();

  // --- אתחול לקוח supabase (רק במצב LIVE) ---
  let sb = null;
  if (!IS_MOCK) {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.error('[portalData] supabase-js לא נטען. הוסף את ה-CDN לפני הקובץ הזה.');
    } else {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  // ============================================================
  // עזרי זהות + טוקן גישה
  // ============================================================
  function getViewerId() {
    try { return localStorage.getItem(EMAIL_KEY) || null; } catch (e) { return null; }
  }
  function setViewerId(email) {
    try { if (email) localStorage.setItem(EMAIL_KEY, email); } catch (e) { /* no-op */ }
  }
  function getAccessToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
  }
  function setAccessToken(token) {
    try { if (token) localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* no-op */ }
  }

  // קריאה ל-Edge Function (כל הכתיבות עוברות דרך כאן ב-LIVE).
  async function callFn(name, body) {
    const res = await fetch(SUPABASE_URL + '/functions/v1/' + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body || {}),
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* ריק */ }
    if (!res.ok) return Object.assign({ ok: false, error: data.error || ('HTTP ' + res.status) }, data);
    return data;
  }

  // ============================================================
  // נתוני דמה (MOCK)
  // ============================================================
  const MOCK_LESSONS = [
    { id: 'lsn-1', title: 'מבוא: מאיפה באמת מגיעים לידים', description: 'הבסיס של משפך לידים.',
      module_id: 'mod-1', course_id: 'crs-1', loom_url: 'https://player.vimeo.com/video/76979871',
      thumbnail_url: '', duration_minutes: 8, order: 1 },
    { id: 'lsn-2', title: 'לבנות מקור לידים יציב', description: 'איך מייצרים זרם קבוע.',
      module_id: 'mod-1', course_id: 'crs-1', loom_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      thumbnail_url: '', duration_minutes: 12, order: 2 },
    { id: 'lsn-3', title: 'לסנן לידים רלוונטיים', description: 'איכות לפני כמות.',
      module_id: 'mod-2', course_id: 'crs-1', loom_url: 'prompt:כתוב לי 3 שאלות סינון ללידים בתחום שלי',
      thumbnail_url: '', duration_minutes: 6, order: 1 },
    { id: 'lsn-4', title: 'לסגור יותר עסקאות', description: 'מסגרת מכירה פשוטה.',
      module_id: 'mod-2', course_id: 'crs-1', loom_url: 'https://www.loom.com/embed/abcdef1234567890',
      thumbnail_url: '', duration_minutes: 15, order: 2 },
  ];
  const MOCK_MODULES = [
    { id: 'mod-1', title: 'ייצור לידים', description: 'איך מביאים לידים.', course_id: 'crs-1', order: 1 },
    { id: 'mod-2', title: 'סינון ומכירה', description: 'איכות וסגירה.', course_id: 'crs-1', order: 2 },
  ];
  const MOCK_COURSES = [
    { id: 'crs-1', title: 'משפך לידים רווחי', description: 'הקורס החינמי המלא.',
      cover_image: '', status: 'published', order: 1 },
  ];
  const MOCK_BADGES = [
    { code: 'survey_done',  title: 'מיפוי הושלם', icon: '🧭', description: 'מילאת את שאלון ההתאמה.' },
    { code: 'first_lesson', title: 'צעד ראשון',   icon: '🚀', description: 'סיימת שיעור ראשון.' },
    { code: 'five_lessons', title: 'בתנופה',       icon: '🔥', description: 'סיימת 5 שיעורים.' },
    { code: 'streak_3',     title: 'שלושה ברצף',   icon: '📅', description: '3 ימי למידה רצופים.' },
    { code: 'xp_100',       title: '100 נקודות',   icon: '💯', description: 'צברת 100 נקודות.' },
  ];

  const mockProgress = {};            // `${viewerId}|${lessonId}` -> true
  const mockState = {};               // viewerId -> { xp, badges:Set, streak, refs }
  function ms(vid) {
    if (!mockState[vid]) mockState[vid] = { xp: 0, badges: new Set(), streak: 1, refs: 0 };
    return mockState[vid];
  }
  function mockDelay(value) {
    return new Promise((resolve) => setTimeout(() => resolve(value), 120));
  }

  // ============================================================
  // API ציבורי — רישום / שאלון / גישה
  // ============================================================

  // רישום ליד (מייל + טלפון). turnstileToken/referralCode אופציונליים.
  async function registerLead({ email, phone, turnstileToken, referralCode }) {
    if (email) setViewerId(email);
    if (IS_MOCK) {
      return mockDelay({ ok: true, lead: { id: 'mock-lead', email, phone, status: 'new' } });
    }
    return callFn('register-lead', { email, phone, turnstileToken, referralCode });
  }

  // שמירת תשובות השאלון (השער).
  async function saveSurveyResponse(obj) {
    const email = obj.user_email || obj.email || getViewerId();
    if (email) setViewerId(email);
    if (IS_MOCK) {
      return mockDelay({ ok: true, response: { id: 'mock-survey', user_email: email, ...obj } });
    }
    return callFn('save-survey', {
      email: email,
      uploads_content: obj.uploads_content,
      does_paid_ads: obj.does_paid_ads,
      marketing_concern: obj.marketing_concern,
      has_team: obj.has_team,
      income_goal: obj.income_goal,
      turnstileToken: obj.turnstileToken,
    });
  }

  // מתן גישה אמיתי (אחרי שאלון). מחזיר טוקן חתום ושומר אותו.
  async function grantAccess(email) {
    const e = email || getViewerId();
    if (e) setViewerId(e);
    if (IS_MOCK) {
      const st = ms(e); st.badges.add('survey_done'); st.xp += 25;
      const token = 'mock-token-' + e;
      setAccessToken(token);
      return mockDelay({ ok: true, token, referral_code: 'MOCKCODE', new_badges: ['survey_done'] });
    }
    const res = await callFn('grant-access', { email: e });
    if (res && res.ok && res.token) setAccessToken(res.token);
    return res;
  }

  // אימות גישה צד-שרת (להחלפת בדיקת דגל localStorage).
  async function verifyAccess() {
    const token = getAccessToken();
    if (!token) return { valid: false };
    if (IS_MOCK) {
      return mockDelay({ valid: true, email: getViewerId() });
    }
    return callFn('verify-access', { token });
  }

  // ============================================================
  // API ציבורי — תוכן (קריאה ישירה עם anon)
  // ============================================================
  async function getCourses() {
    if (IS_MOCK) {
      return mockDelay(MOCK_COURSES.filter((c) => c.status === 'published').sort((a, b) => a.order - b.order));
    }
    const { data, error } = await sb.from('course').select('*')
      .eq('status', 'published').order('order', { ascending: true });
    if (error) { console.error('[portalData] getCourses', error.message); return []; }
    return data || [];
  }

  async function getCourseTree(courseId) {
    if (IS_MOCK) {
      const course = MOCK_COURSES.find((c) => c.id === courseId) || null;
      if (!course) return mockDelay(null);
      const modules = MOCK_MODULES.filter((m) => m.course_id === courseId)
        .sort((a, b) => a.order - b.order)
        .map((m) => ({ ...m, lessons: MOCK_LESSONS.filter((l) => l.module_id === m.id).sort((a, b) => a.order - b.order) }));
      return mockDelay({ ...course, modules });
    }
    const { data: course, error: cErr } = await sb.from('course').select('*').eq('id', courseId).single();
    if (cErr) { console.error('[portalData] getCourseTree/course', cErr.message); return null; }
    const { data: modules, error: mErr } = await sb.from('module').select('*')
      .eq('course_id', courseId).order('order', { ascending: true });
    if (mErr) { console.error('[portalData] getCourseTree/modules', mErr.message); return { ...course, modules: [] }; }
    const { data: lessons, error: lErr } = await sb.from('lesson').select('*')
      .eq('course_id', courseId).order('order', { ascending: true });
    if (lErr) { console.error('[portalData] getCourseTree/lessons', lErr.message); return { ...course, modules: [] }; }
    const tree = (modules || []).map((m) => ({ ...m, lessons: (lessons || []).filter((l) => l.module_id === m.id) }));
    return { ...course, modules: tree };
  }

  // ============================================================
  // API ציבורי — התקדמות (קריאה ישירה / כתיבה דרך Edge Function)
  // ============================================================
  async function getProgress(viewerId) {
    const vid = viewerId || getViewerId();
    if (!vid) return [];
    if (IS_MOCK) {
      const done = Object.keys(mockProgress).filter((k) => k.startsWith(vid + '|') && mockProgress[k]).map((k) => k.split('|')[1]);
      return mockDelay(done);
    }
    const { data, error } = await sb.from('lesson_progress').select('lesson_id, completed')
      .eq('viewer_id', vid).eq('completed', true);
    if (error) { console.error('[portalData] getProgress', error.message); return []; }
    return (data || []).map((r) => r.lesson_id);
  }

  // סימון שיעור כהושלם (דרך track-progress; נקודות/רצף/תגים בשרת).
  async function markLessonComplete(lessonId, courseId /*, viewerId */) {
    if (IS_MOCK) {
      const vid = getViewerId(); if (!vid) return { ok: false, error: 'no viewer_id' };
      mockProgress[vid + '|' + lessonId] = true;
      const st = ms(vid); st.xp += 20;
      const done = Object.keys(mockProgress).filter((k) => k.startsWith(vid + '|') && mockProgress[k]).length;
      const fresh = [];
      if (done >= 1 && !st.badges.has('first_lesson')) { st.badges.add('first_lesson'); fresh.push('first_lesson'); }
      if (done >= 5 && !st.badges.has('five_lessons')) { st.badges.add('five_lessons'); fresh.push('five_lessons'); }
      return mockDelay({ ok: true, xp_total: st.xp, streak: { current_streak: st.streak, longest_streak: st.streak }, new_badges: fresh });
    }
    const token = getAccessToken();
    if (!token) return { ok: false, error: 'no access token' };
    return callFn('track-progress', { token, type: 'complete', lesson_id: lessonId, course_id: courseId });
  }

  // תיעוד צפייה בשיעור.
  async function recordLessonView(lessonId, courseId /*, viewerId */) {
    if (IS_MOCK) return mockDelay({ ok: true });
    const token = getAccessToken();
    if (!token) return { ok: false, error: 'no access token' };
    return callFn('track-progress', { token, type: 'view', lesson_id: lessonId, course_id: courseId });
  }

  // נקודות על פעולה מותרת (הסכום נקבע בשרת לפי reason).
  async function addXP(reason) {
    if (IS_MOCK) {
      const vid = getViewerId(); const st = ms(vid);
      const map = { daily_login: 5, shared: 10, game_completed: 15 };
      st.xp += (map[reason] || 0);
      return mockDelay({ ok: true, xp_total: st.xp });
    }
    const token = getAccessToken();
    if (!token) return { ok: false, error: 'no access token' };
    return callFn('track-progress', { token, type: 'xp', reason });
  }

  // ============================================================
  // API ציבורי — גיימיפיקציה (קריאה ישירה עם anon)
  // ============================================================
  async function getXP(viewerId) {
    const vid = viewerId || getViewerId();
    if (!vid) return 0;
    if (IS_MOCK) return mockDelay(ms(vid).xp);
    const { data, error } = await sb.from('v_user_xp').select('total_xp').eq('viewer_id', vid).maybeSingle();
    if (error) { console.error('[portalData] getXP', error.message); return 0; }
    return (data && data.total_xp) || 0;
  }

  async function getBadges(viewerId) {
    const vid = viewerId || getViewerId();
    if (IS_MOCK) {
      const st = ms(vid);
      return mockDelay({
        earned: MOCK_BADGES.filter((b) => st.badges.has(b.code)),
        catalog: MOCK_BADGES,
      });
    }
    const { data: catalog } = await sb.from('badge').select('*').order('sort_order', { ascending: true });
    if (!vid) return { earned: [], catalog: catalog || [] };
    const { data: earned, error } = await sb.from('user_badge')
      .select('earned_at, badge:badge_id (code, title, description, icon, sort_order)')
      .eq('viewer_id', vid);
    if (error) { console.error('[portalData] getBadges', error.message); return { earned: [], catalog: catalog || [] }; }
    return { earned: (earned || []).map((r) => ({ ...r.badge, earned_at: r.earned_at })), catalog: catalog || [] };
  }

  async function getStreak(viewerId) {
    const vid = viewerId || getViewerId();
    if (!vid) return { current_streak: 0, longest_streak: 0 };
    if (IS_MOCK) { const st = ms(vid); return mockDelay({ current_streak: st.streak, longest_streak: st.streak }); }
    const { data, error } = await sb.from('user_streak')
      .select('current_streak, longest_streak, last_active_date').eq('viewer_id', vid).maybeSingle();
    if (error) { console.error('[portalData] getStreak', error.message); return { current_streak: 0, longest_streak: 0 }; }
    return data || { current_streak: 0, longest_streak: 0 };
  }

  async function getLeaderboard(limit) {
    const n = limit || 10;
    if (IS_MOCK) {
      const rows = Object.keys(mockState).map((vid, i) => ({
        viewer_id: vid, display_name: vid.split('@')[0], total_xp: mockState[vid].xp,
        badges_count: mockState[vid].badges.size, rank: i + 1,
      })).sort((a, b) => b.total_xp - a.total_xp).slice(0, n);
      return mockDelay(rows);
    }
    const { data, error } = await sb.from('v_leaderboard').select('*').limit(n);
    if (error) { console.error('[portalData] getLeaderboard', error.message); return []; }
    return data || [];
  }

  async function getReferrals(viewerId) {
    const vid = viewerId || getViewerId();
    if (!vid) return { code: null, total_referrals: 0, converted_referrals: 0 };
    if (IS_MOCK) return mockDelay({ code: 'MOCKCODE', total_referrals: ms(vid).refs, converted_referrals: 0 });
    const { data: stats } = await sb.from('v_referral_stats').select('*').eq('viewer_id', vid).maybeSingle();
    const { data: rc } = await sb.from('referral_code').select('code').eq('viewer_id', vid).maybeSingle();
    return {
      code: (rc && rc.code) || null,
      total_referrals: (stats && stats.total_referrals) || 0,
      converted_referrals: (stats && stats.converted_referrals) || 0,
    };
  }

  // ============================================================
  // חשיפה גלובלית
  // ============================================================
  window.portalData = {
    _mode: IS_MOCK ? 'MOCK' : 'LIVE',
    // זהות + גישה
    getViewerId, setViewerId, getAccessToken, grantAccess, verifyAccess,
    // רישום / שאלון
    registerLead, saveSurveyResponse,
    // תוכן
    getCourses, getCourseTree,
    // התקדמות
    getProgress, markLessonComplete, recordLessonView,
    // גיימיפיקציה
    getXP, addXP, getBadges, getStreak, getLeaderboard, getReferrals,
  };

  console.info('[portalData] מצב:', window.portalData._mode);
})();
