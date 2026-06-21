/**
 * admin-data.js — שכבת נתונים ואימות לדאשבורד בעלים "סקייל רווחי"
 * תלוי על: window.supabase (supabase-js CDN נטען לפני קובץ זה ב-admin.html)
 * RLS: anon חסום — רק JWT של אדמין מאומת מתיר קריאה
 */

(function () {
  'use strict';

  const SUPABASE_URL = 'https://mcpprxujlgpdkgnjjunf.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jcHByeHVqbGdwZGtnbmpqdW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzM3ODIsImV4cCI6MjA5NzM0OTc4Mn0.rTgP-j2smBjzV4ixT7Ea0I0leOAErVLN5F5aULDNHM4';

  /** instance יחיד של ה-client — נוצר פעם אחת ב-init() */
  let _sb = null;

  // ─── עזר פנימי: fetch בטוח — מחזיר מערך ריק אם הטבלה/עמודה חסרה ───────────
  async function _safeSelect(table, query) {
    try {
      const { data, error } = await query;
      if (error) return [];
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  // ─── חישוב דרגת חום לכל ליד ──────────────────────────────────────────────────
  // hot  = יש לו לפחות רשומת progress עם completed=true
  // warm = יש survey אך אין התקדמות
  // cold = רק ליד
  function _calcHeat(email, surveyEmails, hotEmails) {
    if (hotEmails.has(email)) return 'hot';
    if (surveyEmails.has(email)) return 'warm';
    return 'cold';
  }

  // ─── API ציבורי ───────────────────────────────────────────────────────────────
  window.AdminData = {

    /**
     * init() — יוצר supabase client אחד ושומר ב-_sb.
     * חובה לקרוא לפני כל שאר הפונקציות.
     */
    init() {
      if (_sb) return;
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('supabase-js לא נטען — ודא שה-CDN מגיע לפני admin-data.js');
      }
      _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    },

    /**
     * login(email, password) — כניסת אדמין
     * @returns {{ ok: boolean, error?: string }}
     */
    async login(email, password) {
      try {
        const { error } = await _sb.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message || 'שגיאה לא צפויה' };
      }
    },

    /**
     * logout() — יציאה
     */
    async logout() {
      try {
        await _sb.auth.signOut();
      } catch (_) {}
    },

    /**
     * currentUser() — מחזיר את אובייקט המשתמש המחובר, או null
     */
    async currentUser() {
      try {
        const { data } = await _sb.auth.getUser();
        return data?.user ?? null;
      } catch (_) {
        return null;
      }
    },

    /**
     * getOverview() — סיכום כללי לדאשבורד
     * @returns {{ leads, surveys, hot, warm, cold, lessonsCompleted, totalXp }}
     */
    async getOverview() {
      const [leads, surveys, progress, xpEvents] = await Promise.all([
        _safeSelect('lead', _sb.from('lead').select('id,email')),
        _safeSelect('survey_response', _sb.from('survey_response').select('user_email')),
        _safeSelect('lesson_progress', _sb.from('lesson_progress').select('viewer_id,completed')),
        _safeSelect('xp_event', _sb.from('xp_event').select('*')),
      ]);

      const surveyEmails = new Set(surveys.map((s) => s.user_email).filter(Boolean));

      // hot = מיילים שיש להם completed=true
      const hotEmails = new Set(
        progress.filter((p) => p.completed === true).map((p) => p.viewer_id).filter(Boolean)
      );

      let hot = 0, warm = 0, cold = 0;
      for (const lead of leads) {
        const h = _calcHeat(lead.email, surveyEmails, hotEmails);
        if (h === 'hot') hot++;
        else if (h === 'warm') warm++;
        else cold++;
      }

      // שיעורים שהושלמו (ספירה כוללת של רשומות completed=true)
      const lessonsCompleted = progress.filter((p) => p.completed === true).length;

      // XP — ננסה עמודות points / amount / xp לפי סדר
      let totalXp = 0;
      for (const ev of xpEvents) {
        const pts = ev.points ?? ev.amount ?? ev.xp ?? 0;
        totalXp += (typeof pts === 'number' ? pts : 0);
      }

      return {
        leads: leads.length,
        surveys: surveys.length,
        hot,
        warm,
        cold,
        lessonsCompleted,
        totalXp,
      };
    },

    /**
     * getLeads() — רשימת לידים מלאה, ממוינת מהחדש לישן
     * @returns {Array<{id,email,phone,status,created_at,concern,income_goal,has_team,lessons_done,heat}>}
     */
    async getLeads() {
      const [leads, surveys, progress] = await Promise.all([
        _safeSelect('lead', _sb.from('lead').select('id,email,phone,status,created_at').order('created_at', { ascending: false })),
        _safeSelect('survey_response', _sb.from('survey_response').select('user_email,marketing_concern,income_goal,has_team')),
        _safeSelect('lesson_progress', _sb.from('lesson_progress').select('viewer_id,completed')),
      ]);

      // אינדקסים מהירים
      const surveyMap = {};
      for (const s of surveys) {
        if (s.user_email) surveyMap[s.user_email] = s;
      }

      const surveyEmails = new Set(Object.keys(surveyMap));

      const hotEmails = new Set(
        progress.filter((p) => p.completed === true).map((p) => p.viewer_id).filter(Boolean)
      );

      // מספר שיעורים שהושלמו לכל מייל
      const lessonCount = {};
      for (const p of progress) {
        if (p.viewer_id && p.completed === true) {
          lessonCount[p.viewer_id] = (lessonCount[p.viewer_id] || 0) + 1;
        }
      }

      return leads.map((lead) => {
        const sv = surveyMap[lead.email] || {};
        const lessons = lessonCount[lead.email] || 0;
        return {
          id: lead.id,
          email: lead.email,
          phone: lead.phone ?? null,
          status: lead.status ?? null,
          created_at: lead.created_at,
          // מפתחות שה-renderer (admin-views.js) קורא בשם המקורי מה-DB
          marketing_concern: sv.marketing_concern ?? null,
          income_goal: sv.income_goal ?? null,
          has_team: sv.has_team ?? null,
          // lessons_count = השם שטבלת AdminViews קוראת; lessons_done = שם הפולבק ב-admin.html
          lessons_count: lessons,
          lessons_done: lessons,
          // concern נשמר כ-alias לאחור-תאימות
          concern: sv.marketing_concern ?? null,
          heat: _calcHeat(lead.email, surveyEmails, hotEmails),
        };
      });
    },

    /**
     * getLeadDetail(id) — פרטים מלאים של ליד יחיד
     * @returns {{ lead, survey, progress: Array, xp: number }}
     */
    async getLeadDetail(id) {
      // שלב 1: משוך את הליד כדי לקבל את המייל
      let lead = null;
      try {
        const { data } = await _sb.from('lead').select('*').eq('id', id).single();
        lead = data ?? null;
      } catch (_) {}

      if (!lead) return { lead: null, survey: null, progress: [], xp: 0 };

      const email = lead.email;

      const [surveys, progress, xpEvents, businessProfileResult] = await Promise.all([
        _safeSelect('survey_response', _sb.from('survey_response').select('*').eq('user_email', email)),
        _safeSelect('lesson_progress', _sb.from('lesson_progress').select('*').eq('viewer_id', email)),
        _safeSelect('xp_event', _sb.from('xp_event').select('*').eq('viewer_id', email)),
        // פרופיל עסקי שנאסף ע"י המורה ה-AI מהשיחה
        (async () => {
          try {
            const { data, error } = await _sb
              .from('lead_business_profile')
              .select('*')
              .eq('user_email', email)
              .maybeSingle();
            if (error) return null;
            return data ?? null;
          } catch (_) {
            return null;
          }
        })(),
      ]);

      // XP — ננסה עמודות points / amount / xp
      let xp = 0;
      for (const ev of xpEvents) {
        const pts = ev.points ?? ev.amount ?? ev.xp ?? 0;
        xp += (typeof pts === 'number' ? pts : 0);
      }

      return {
        lead,
        survey: surveys[0] ?? null,
        progress,
        xp,
        business: businessProfileResult ?? null,
      };
    },

    /**
     * getCtaPopup() — מחזיר את פופאפ הסיום-שיעור הנוכחי (שורה יחידה),
     * או null אם אין עדיין. דורש JWT אדמין (RLS: is_admin()).
     * שדות: { id, title, body, button_label, button_url, active, updated_at }
     */
    async getCtaPopup() {
      try {
        const { data, error } = await _sb
          .from('lesson_cta_popup')
          .select('id,title,body,button_label,button_url,active,updated_at')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return null;
        return data ?? null;
      } catch (_) {
        return null;
      }
    },

    /**
     * saveCtaPopup(payload) — upsert לפופאפ הסיום-שיעור (דרך JWT אדמין).
     * אם יש id — update; אחרת insert שורה חדשה.
     * @param {{ id?, title, body, button_label, button_url, active }} payload
     * @returns {{ ok: boolean, data?, error?: string }}
     */
    async saveCtaPopup(payload) {
      try {
        const row = {
          title:        payload.title ?? null,
          body:         payload.body ?? null,
          button_label: payload.button_label ?? null,
          button_url:   payload.button_url ?? null,
          active:       payload.active === true,
          updated_at:   new Date().toISOString(),
        };
        if (payload.id) row.id = payload.id;

        const { data, error } = await _sb
          .from('lesson_cta_popup')
          .upsert(row, { onConflict: 'id' })
          .select('id,title,body,button_label,button_url,active,updated_at')
          .single();

        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message || 'שגיאה לא צפויה' };
      }
    },
  };
})();
