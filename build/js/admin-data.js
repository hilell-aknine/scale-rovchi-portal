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

  // ─── חישוב דרגת חום לכל ליד (v2 — מבוסס עומק + רקנסי) ────────────────────────
  // hot  = השלים ≥1 שיעור וגם היה פעיל ב-HEAT_RECENCY_DAYS הימים האחרונים
  // warm = הביע עניין אמיתי אך לא חם כרגע:
  //        השלים שיעור אך התקרר (לא פעיל מעל החלון) / מילא שאלון / נגע בקורס בלי להשלים
  // cold = ליד בלבד — בלי שאלון ובלי שום פעילות
  const HEAT_RECENCY_DAYS = 30; // חלון "טריות" — אפשר לכוונן

  // סורק שדות-תאריך נפוצים בשורה ומחזיר timestamp במילישניות, או 0 אם אין
  function _rowTs(row) {
    const keys = ['completed_at', 'last_viewed_at', 'last_seen_at', 'updated_at',
                  'created_at', 'inserted_at', 'event_at', 'occurred_at', 'ts'];
    for (const k of keys) {
      const v = row && row[k];
      if (v) {
        const t = Date.parse(v);
        if (!isNaN(t)) return t;
      }
    }
    return 0;
  }

  // ctx = { surveyEmails:Set, completedMap:Map, activeEmails:Set, lastActiveMap:Map, now:number, windowMs:number }
  function _calcHeat(email, ctx) {
    const completed = ctx.completedMap.get(email) || 0;
    const lastTs    = ctx.lastActiveMap.get(email) || 0;
    const recent    = lastTs > 0 && (ctx.now - lastTs) <= ctx.windowMs;

    if (completed >= 1 && recent) return 'hot';
    if (completed >= 1 || ctx.surveyEmails.has(email) || ctx.activeEmails.has(email)) return 'warm';
    return 'cold';
  }

  // בונה את כל מבני העזר לחישוב חום ממערכי progress + xp הגולמיים
  function _buildHeatCtx(surveys, progress, xpEvents) {
    const surveyEmails = new Set(surveys.map((s) => s.user_email).filter(Boolean));
    const completedMap = new Map();   // email -> מספר שיעורים שהושלמו
    const activeEmails = new Set();   // email -> נגע בקורס (progress/xp כלשהם)
    const lastActiveMap = new Map();  // email -> timestamp אחרון של פעילות

    const touch = (email, ts) => {
      if (!email) return;
      activeEmails.add(email);
      if (ts > (lastActiveMap.get(email) || 0)) lastActiveMap.set(email, ts);
    };

    for (const p of progress) {
      const email = p.viewer_id;
      touch(email, _rowTs(p));
      if (email && p.completed === true) {
        completedMap.set(email, (completedMap.get(email) || 0) + 1);
      }
    }
    for (const ev of xpEvents) {
      touch(ev.viewer_id, _rowTs(ev));
    }

    return {
      surveyEmails,
      completedMap,
      activeEmails,
      lastActiveMap,
      now: Date.now(),
      windowMs: HEAT_RECENCY_DAYS * 24 * 60 * 60 * 1000,
    };
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
        _safeSelect('lesson_progress', _sb.from('lesson_progress').select('*')),
        _safeSelect('xp_event', _sb.from('xp_event').select('*')),
      ]);

      const heatCtx = _buildHeatCtx(surveys, progress, xpEvents);

      let hot = 0, warm = 0, cold = 0;
      for (const lead of leads) {
        const h = _calcHeat(lead.email, heatCtx);
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
      const [leads, surveys, progress, xpEvents] = await Promise.all([
        _safeSelect('lead', _sb.from('lead').select('id,email,phone,status,created_at').order('created_at', { ascending: false })),
        _safeSelect('survey_response', _sb.from('survey_response').select('user_email,marketing_concern,income_goal,has_team')),
        _safeSelect('lesson_progress', _sb.from('lesson_progress').select('*')),
        _safeSelect('xp_event', _sb.from('xp_event').select('*')),
      ]);

      // אינדקסים מהירים
      const surveyMap = {};
      for (const s of surveys) {
        if (s.user_email) surveyMap[s.user_email] = s;
      }

      const heatCtx = _buildHeatCtx(surveys, progress, xpEvents);

      return leads.map((lead) => {
        const sv = surveyMap[lead.email] || {};
        const lessons = heatCtx.completedMap.get(lead.email) || 0;
        const lastTs = heatCtx.lastActiveMap.get(lead.email) || 0;
        const daysInactive = lastTs > 0
          ? Math.floor((heatCtx.now - lastTs) / (24 * 60 * 60 * 1000))
          : null;
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
          heat: _calcHeat(lead.email, heatCtx),
          // מטא-דאטה לרקנסי — לשימוש עתידי בטבלה ("פעיל לפני X ימים")
          last_active: lastTs > 0 ? new Date(lastTs).toISOString() : null,
          days_inactive: daysInactive,
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

    /**
     * getReminderStats() — ספירות תזכורות (דרך RPC מגודר ב-is_admin).
     * @returns {{ opted_in_active, unsubscribed, paused, sent_7d, failed_7d, pending_queue }}
     */
    async getReminderStats() {
      try {
        const { data, error } = await _sb.rpc('reminder_admin_stats');
        if (error) return {};
        return data ?? {};
      } catch (_) {
        return {};
      }
    },

    /**
     * getReminderRecent() — 10 ההודעות האחרונות (דרך RPC מגודר ב-is_admin).
     * @returns {Array<{ display_name, template, status, created_at }>}
     */
    async getReminderRecent() {
      try {
        const { data, error } = await _sb.rpc('reminder_admin_recent', { p_limit: 10 });
        if (error) return [];
        return Array.isArray(data) ? data : [];
      } catch (_) {
        return [];
      }
    },
  };
})();
