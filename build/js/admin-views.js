/**
 * admin-views.js — פונקציות רינדור דאשבורד בעלים, סקייל רווחי
 * ============================================================
 * API ציבורי: window.AdminViews
 *   heatBadge(heat)
 *   renderOverview(stats, el)
 *   renderLeadsTable(leads, el, onRowClick)
 *   renderLeadDetail(detail, el)
 *
 * דרישות: vanilla JS, ללא תלויות חיצוניות, ללא גישת DOM גלובלי,
 * RTL, תמיכה במצב כהה/בהיר, ניגודיות CSS vars מהמותג.
 * ============================================================
 */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     עזרים פנימיים
  ───────────────────────────────────────────────────────────── */

  /** מחרוזת תאריך לפי לוקאל עברי */
  function _fmtDate(val) {
    if (!val) return '—';
    try {
      return new Intl.DateTimeFormat('he-IL', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      }).format(new Date(val));
    } catch (_) { return String(val); }
  }

  /** בריחה בטוחה מ-XSS */
  function _esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** מיפוי ערכי שאלון לעברית קריאה */
  const FIELD_LABELS = {
    marketing_concern: {
      no_leads:              'אין מספיק לידים',
      irrelevant_leads_paid: 'לידים לא רלוונטיים (ממומן)',
      irrelevant_leads_no_paid: 'לידים לא רלוונטיים (אורגני)',
      hard_to_sell:          'קשה לסגור ולמכור'
    },
    bool: { true: 'כן', false: 'לא' }
  };

  function _mapConcern(val) {
    return FIELD_LABELS.marketing_concern[val] || _esc(val) || '—';
  }

  function _mapBool(val) {
    if (val === true  || val === 'true')  return 'כן';
    if (val === false || val === 'false') return 'לא';
    return '—';
  }

  function _mapIncomeGoal(val) {
    if (!val) return '—';
    const clean = String(val).replace(/[^\d+k]/gi, '');
    return _esc(val) + '₪';
  }

  /* ─────────────────────────────────────────────────────────────
     סגנונות מוזרקים פעם אחת
  ───────────────────────────────────────────────────────────── */
  (function _injectStyles() {
    const ID = 'av-styles';
    if (document.getElementById(ID)) return;
    const style = document.createElement('style');
    style.id = ID;
    style.textContent = /* css */`
      /* ─── כרטיסי סיכום ─── */
      .av-overview {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 1rem;
        direction: rtl;
      }
      .av-stat-card {
        background: var(--surface, #fff);
        border: 1px solid var(--line, rgba(12,37,66,.12));
        border-radius: var(--radius-sm, 12px);
        padding: 1.1rem 1rem 0.9rem;
        box-shadow: var(--shadow, 0 4px 12px rgba(12,37,66,.08));
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: .35rem;
      }
      .av-stat-card .av-stat-icon {
        font-size: 1.4rem;
        line-height: 1;
      }
      .av-stat-card .av-stat-value {
        font-size: 2rem;
        font-weight: 800;
        color: var(--navy, #0c2542);
        line-height: 1.1;
      }
      .av-stat-card .av-stat-label {
        font-size: 0.78rem;
        color: var(--muted, #5a6b7a);
        font-weight: 500;
      }

      /* ─── תגיות חום ─── */
      .av-heat {
        display: inline-flex;
        align-items: center;
        gap: .28rem;
        border-radius: 999px;
        padding: .18rem .7rem;
        font-size: .78rem;
        font-weight: 700;
        white-space: nowrap;
      }
      .av-heat-hot  { background: rgba(191,9,47,.12);  color: var(--red, #bf092f); }
      .av-heat-warm { background: rgba(230,130,20,.12); color: #c46a00; }
      .av-heat-cold { background: rgba(90,107,122,.12); color: var(--muted, #5a6b7a); }

      /* ─── טבלת לידים ─── */
      .av-table-wrap {
        overflow-x: auto;
        direction: rtl;
      }
      .av-table {
        width: 100%;
        border-collapse: collapse;
        direction: rtl;
        font-size: .9rem;
      }
      .av-table thead tr {
        background: var(--navy, #0c2542);
        color: #fff;
      }
      .av-table thead th {
        padding: .65rem .85rem;
        text-align: right;
        font-weight: 600;
        font-size: .82rem;
        white-space: nowrap;
      }
      .av-table tbody tr {
        border-bottom: 1px solid var(--line, rgba(12,37,66,.08));
        cursor: pointer;
        transition: background .15s;
      }
      .av-table tbody tr:hover {
        background: var(--bg, #f5f8fc);
      }
      .av-table tbody td {
        padding: .6rem .85rem;
        color: var(--navy, #0c2542);
        vertical-align: middle;
      }
      .av-table tbody td.av-td-muted {
        color: var(--muted, #5a6b7a);
        font-size: .85rem;
      }

      /* ─── empty state ─── */
      .av-empty {
        padding: 3rem 1rem;
        text-align: center;
        color: var(--muted, #5a6b7a);
        font-size: .95rem;
        direction: rtl;
      }
      .av-empty .av-empty-icon {
        font-size: 2.5rem;
        display: block;
        margin-bottom: .6rem;
        opacity: .55;
      }

      /* ─── פאנל פירוט ─── */
      .av-detail {
        direction: rtl;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .av-detail-section {
        background: var(--surface, #fff);
        border: 1px solid var(--line, rgba(12,37,66,.1));
        border-radius: var(--radius, 18px);
        padding: 1.2rem 1.4rem;
        box-shadow: var(--shadow, 0 4px 12px rgba(12,37,66,.06));
      }
      .av-detail-section h3 {
        margin: 0 0 .9rem;
        font-size: 1rem;
        font-weight: 700;
        color: var(--navy, #0c2542);
        display: flex;
        align-items: center;
        gap: .4rem;
      }
      .av-detail-row {
        display: flex;
        align-items: flex-start;
        gap: .5rem;
        padding: .35rem 0;
        border-bottom: 1px solid var(--line, rgba(12,37,66,.06));
        font-size: .9rem;
      }
      .av-detail-row:last-child { border-bottom: none; }
      .av-detail-key {
        flex: 0 0 180px;
        color: var(--muted, #5a6b7a);
        font-weight: 500;
        font-size: .85rem;
      }
      .av-detail-val {
        flex: 1;
        color: var(--navy, #0c2542);
        font-weight: 600;
      }

      /* ─── רשימת התקדמות ─── */
      .av-progress-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: .4rem;
      }
      .av-progress-item {
        display: flex;
        align-items: center;
        gap: .55rem;
        font-size: .88rem;
        color: var(--navy, #0c2542);
      }
      .av-progress-item .av-pi-icon {
        font-size: 1.1rem;
        flex-shrink: 0;
      }

      /* ─── XP badge ─── */
      .av-xp-badge {
        display: inline-flex;
        align-items: center;
        gap: .3rem;
        background: var(--navy, #0c2542);
        color: #fff;
        border-radius: 999px;
        padding: .25rem .8rem;
        font-weight: 800;
        font-size: .95rem;
        letter-spacing: .02em;
      }

      /* ─── פרופיל עסקי (מהשיחה עם המורה) ─── */
      .av-biz-section {
        border-right: 4px solid var(--blue, #1e6fa8);
        background: var(--surface, #fff);
      }
      .av-biz-section h3 {
        color: var(--blue, #1e6fa8) !important;
      }
      .av-biz-field {
        display: flex;
        flex-direction: column;
        gap: .25rem;
        padding: .6rem 0;
        border-bottom: 1px solid var(--line, rgba(12,37,66,.06));
      }
      .av-biz-field:last-child { border-bottom: none; }
      .av-biz-field-label {
        font-size: .8rem;
        font-weight: 600;
        color: var(--muted, #5a6b7a);
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .av-biz-field-value {
        font-size: .93rem;
        color: var(--navy, #0c2542);
        font-weight: 500;
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .av-biz-updated {
        font-size: .78rem;
        color: var(--muted, #5a6b7a);
        margin-top: .6rem;
        display: block;
      }
      /* dark mode */
      @media (prefers-color-scheme: dark) {
        .av-biz-section { background: var(--surface, #111c28); }
        .av-biz-field-value { color: var(--frost, #e2eaf2); }
        .av-biz-section h3 { color: #5ab4f5 !important; }
        .av-biz-section { border-right-color: #5ab4f5; }
      }
    `;
    document.head.appendChild(style);
  })();

  /* ─────────────────────────────────────────────────────────────
     1. heatBadge(heat) → HTML string
  ───────────────────────────────────────────────────────────── */
  function heatBadge(heat) {
    const map = {
      hot:  { cls: 'av-heat-hot',  icon: '🔥', label: 'חם'   },
      warm: { cls: 'av-heat-warm', icon: '🌤️', label: 'פושר' },
      cold: { cls: 'av-heat-cold', icon: '❄️', label: 'קר'   }
    };
    const cfg = map[heat] || map.cold;
    return `<span class="av-heat ${_esc(cfg.cls)}" title="${_esc(cfg.label)}">
              <span aria-hidden="true">${cfg.icon}</span>
              <span>${_esc(cfg.label)}</span>
            </span>`;
  }

  /* ─────────────────────────────────────────────────────────────
     2. renderOverview(stats, el)
     stats = { leads, surveys, hot, warm, cold, lessonsCompleted, totalXp }
  ───────────────────────────────────────────────────────────── */
  function renderOverview(stats, el) {
    if (!el) return;
    const s = stats || {};

    const cards = [
      { icon: '👥', value: s.leads           ?? 0, label: 'סה"כ לידים'         },
      { icon: '📋', value: s.surveys         ?? 0, label: 'שאלונים מלאים'       },
      { icon: '🔥', value: s.hot             ?? 0, label: 'לידים חמים'          },
      { icon: '🌤️', value: s.warm            ?? 0, label: 'לידים פושרים'        },
      { icon: '❄️', value: s.cold            ?? 0, label: 'לידים קרים'          },
      { icon: '📚', value: s.lessonsCompleted ?? 0, label: 'שיעורים הושלמו'     },
      { icon: '⭐', value: s.totalXp          ?? 0, label: 'סה"כ XP נצבר'       }
    ];

    const html = `<div class="av-overview" role="list" aria-label="סיכום נתונים">
      ${cards.map(c => `
        <div class="av-stat-card" role="listitem">
          <span class="av-stat-icon" aria-hidden="true">${c.icon}</span>
          <span class="av-stat-value">${_esc(String(c.value))}</span>
          <span class="av-stat-label">${_esc(c.label)}</span>
        </div>`).join('')}
    </div>`;

    el.innerHTML = html;
  }

  /* ─────────────────────────────────────────────────────────────
     3. renderLeadsTable(leads, el, onRowClick)
     כל lead: { id, email, phone, heat, marketing_concern, income_goal,
                lessons_count, created_at }
  ───────────────────────────────────────────────────────────── */
  function renderLeadsTable(leads, el, onRowClick) {
    if (!el) return;

    if (!leads || leads.length === 0) {
      el.innerHTML = `
        <div class="av-empty" role="status">
          <span class="av-empty-icon" aria-hidden="true">📭</span>
          <span>אין לידים להצגה עדיין</span>
        </div>`;
      return;
    }

    const headers = [
      { label: '📧 מייל',          key: 'email'             },
      { label: '📱 טלפון',         key: 'phone'             },
      { label: '🌡️ חום',           key: '_heat'             },
      { label: '😟 דאגה עיקרית',   key: '_concern'          },
      { label: '💰 יעד הכנסה',     key: '_income'           },
      { label: '📚 שיעורים',       key: 'lessons_count'     },
      { label: '📅 תאריך הצטרפות', key: '_date'             }
    ];

    const rows = leads.map((lead, idx) => {
      const concern = _mapConcern(lead.marketing_concern);
      const income  = _mapIncomeGoal(lead.income_goal);
      const date    = _fmtDate(lead.created_at);
      const id      = _esc(String(lead.id || idx));

      return `<tr
                data-lead-id="${id}"
                tabindex="0"
                role="button"
                aria-label="פרטי ליד: ${_esc(lead.email || '')}">
        <td>${_esc(lead.email)  || '<span class="av-td-muted">—</span>'}</td>
        <td class="av-td-muted">${_esc(lead.phone) || '—'}</td>
        <td>${heatBadge(lead.heat)}</td>
        <td>${_esc(concern)}</td>
        <td>${_esc(income)}</td>
        <td style="text-align:center;">${_esc(String(lead.lessons_count ?? 0))}</td>
        <td class="av-td-muted">${_esc(date)}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="av-table-wrap" role="region" aria-label="טבלת לידים">
        <table class="av-table" aria-rowcount="${leads.length}">
          <thead>
            <tr>
              ${headers.map(h => `<th scope="col">${_esc(h.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;

    /* אירועי קליק ומקלדת */
    el.querySelectorAll('tr[data-lead-id]').forEach(function (row) {
      function _trigger() {
        const leadId = row.getAttribute('data-lead-id');
        if (typeof onRowClick === 'function') onRowClick(leadId);
      }
      row.addEventListener('click', _trigger);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _trigger(); }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     4. renderLeadDetail(detail, el)
     detail = { lead, survey, progress, xp }
       lead:     שדות הליד הבסיסיים
       survey:   תשובות שאלון גולמיות
       progress: [{ lesson_title, completed_at }]
       xp:       מספר
  ───────────────────────────────────────────────────────────── */
  function renderLeadDetail(detail, el) {
    if (!el) return;

    if (!detail || !detail.lead) {
      el.innerHTML = `
        <div class="av-empty" role="status">
          <span class="av-empty-icon" aria-hidden="true">🔍</span>
          <span>לא נמצאו פרטים עבור ליד זה</span>
        </div>`;
      return;
    }

    const { lead = {}, survey = {}, progress = [], xp = 0, business = null } = detail;

    /* ── חלק 1: פרטי ליד ── */
    const leadRows = [
      { key: '📧 מייל',           val: lead.email   },
      { key: '📱 טלפון',          val: lead.phone   },
      { key: '🌡️ רמת חום',        val: heatBadge(lead.heat) },
      { key: '📅 הצטרף ב',        val: _fmtDate(lead.created_at) }
    ];

    /* ── חלק 2: תשובות שאלון ── */
    const surveyDef = [
      {
        key: 'marketing_concern',
        label: '😟 הדאגה השיווקית העיקרית',
        render: v => _esc(_mapConcern(v))
      },
      {
        key: 'income_goal',
        label: '💰 יעד הכנסה חודשי',
        render: v => _esc(_mapIncomeGoal(v))
      },
      {
        key: 'uploads_content',
        label: '📸 מעלה תוכן לרשתות',
        render: v => _esc(_mapBool(v))
      },
      {
        key: 'does_paid_ads',
        label: '💸 מריץ פרסום ממומן',
        render: v => _esc(_mapBool(v))
      },
      {
        key: 'has_team',
        label: '🤝 יש לו/ה צוות',
        render: v => _esc(_mapBool(v))
      },
      {
        key: 'business_description',
        label: '🏢 תיאור העסק',
        render: v => _esc(v)
      },
      {
        key: 'biggest_challenge',
        label: '🎯 האתגר הגדול ביותר',
        render: v => _esc(v)
      }
    ];

    const surveyHasData = surveyDef.some(d => survey[d.key] !== undefined && survey[d.key] !== null && survey[d.key] !== '');

    /* ── חלק 3: התקדמות בשיעורים ── */
    const hasProg = Array.isArray(progress) && progress.length > 0;

    /* ── render ── */
    el.innerHTML = `
      <div class="av-detail">

        <!-- פרטי ליד -->
        <div class="av-detail-section">
          <h3><span aria-hidden="true">👤</span> פרטי ליד</h3>
          ${leadRows.map(r => `
            <div class="av-detail-row">
              <span class="av-detail-key">${_esc(r.key)}</span>
              <span class="av-detail-val">${r.val !== undefined && r.val !== null ? r.val : '—'}</span>
            </div>`).join('')}
          <div class="av-detail-row" style="border-top:1px solid var(--line,rgba(12,37,66,.08));margin-top:.5rem;padding-top:.7rem;">
            <span class="av-detail-key">⭐ XP שנצבר</span>
            <span class="av-detail-val">
              <span class="av-xp-badge"><span aria-hidden="true">⭐</span> ${_esc(String(xp))}</span>
            </span>
          </div>
        </div>

        <!-- תשובות שאלון -->
        <div class="av-detail-section">
          <h3><span aria-hidden="true">📋</span> תשובות שאלון</h3>
          ${surveyHasData
            ? surveyDef
                .filter(d => survey[d.key] !== undefined && survey[d.key] !== null && survey[d.key] !== '')
                .map(d => `
                  <div class="av-detail-row">
                    <span class="av-detail-key">${_esc(d.label)}</span>
                    <span class="av-detail-val">${d.render(survey[d.key])}</span>
                  </div>`).join('')
            : `<div class="av-empty" role="status" style="padding:1.5rem 0 .5rem;">
                <span class="av-empty-icon" aria-hidden="true">📭</span>
                <span>השאלון טרם מולא</span>
               </div>`}
        </div>

        <!-- התקדמות בשיעורים -->
        <div class="av-detail-section">
          <h3><span aria-hidden="true">📚</span> התקדמות בקורס</h3>
          ${hasProg
            ? `<ul class="av-progress-list" aria-label="שיעורים שהושלמו">
                ${progress.map(p => `
                  <li class="av-progress-item">
                    <span class="av-pi-icon" aria-hidden="true">✅</span>
                    <span>${_esc(p.lesson_title || 'שיעור')}${p.completed_at ? ' <span style="color:var(--muted,.5a6b7a);font-size:.8rem;font-weight:400;">· ' + _esc(_fmtDate(p.completed_at)) + '</span>' : ''}</span>
                  </li>`).join('')}
               </ul>`
            : `<div class="av-empty" role="status" style="padding:1.2rem 0 .3rem;">
                <span class="av-empty-icon" aria-hidden="true">🎒</span>
                <span>עדיין לא הושלם שיעור</span>
               </div>`}
        </div>

        <!-- פרופיל עסקי מהשיחה עם המורה -->
        <div class="av-detail-section av-biz-section">
          <h3><span aria-hidden="true">🧠</span> פרופיל עסקי (מהשיחה עם המורה) 🧠</h3>
          ${business
            ? `
              ${business.business_description ? `
                <div class="av-biz-field">
                  <span class="av-biz-field-label">מה העסק</span>
                  <span class="av-biz-field-value">${_esc(business.business_description)}</span>
                </div>` : ''}
              ${business.main_goal ? `
                <div class="av-biz-field">
                  <span class="av-biz-field-label">מטרה עיקרית</span>
                  <span class="av-biz-field-value">${_esc(business.main_goal)}</span>
                </div>` : ''}
              ${business.challenges ? `
                <div class="av-biz-field">
                  <span class="av-biz-field-label">אתגרים</span>
                  <span class="av-biz-field-value">${_esc(business.challenges)}</span>
                </div>` : ''}
              ${business.raw_notes ? `
                <div class="av-biz-field">
                  <span class="av-biz-field-label">הערות (גולמי)</span>
                  <span class="av-biz-field-value">${_esc(business.raw_notes)}</span>
                </div>` : ''}
              ${business.updated_at ? `<span class="av-biz-updated">עודכן לאחרונה: ${_esc(_fmtDate(business.updated_at))}</span>` : ''}
              `
            : `<div class="av-empty" role="status" style="padding:1.2rem 0 .3rem;">
                <span class="av-empty-icon" aria-hidden="true">💬</span>
                <span>טרם נאסף פרופיל עסקי מהשיחה עם המורה</span>
               </div>`}
        </div>

      </div>`;
  }

  /* ─────────────────────────────────────────────────────────────
     חשיפת ה-API
  ───────────────────────────────────────────────────────────── */
  global.AdminViews = {
    heatBadge,
    renderOverview,
    renderLeadsTable,
    renderLeadDetail
  };

})(window);
