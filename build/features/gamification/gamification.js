/* ════════════════════════════════════════════════════════════
   gamification.js — מנוע הגיימיפיקציה המשותף (סקייל רווחי)
   ────────────────────────────────────────────────────────────
   מודול עצמאי שניתן לשלב בכל עמוד בפורטל. אחראי על:
     • XP (נקודות ניסיון)   • רמות + תארים
     • תגים (Badges)         • רצפים יומיים (Streaks)
   חושף API גלובלי אחד: window.SRGamification.

   מצב ברירת מחדל = MOCK: כל המצב נשמר ב-localStorage לפי המשתמש,
   כדי שהמודול יעבוד standalone בלי צד-שרת. במעבר ל-LIVE מספקים
   onLoad/onSave שמחברים ל-Supabase (ראו INTEGRATION.md).

   זהות: viewerId = המייל של המשתמש (כמו בשאר הפורטל,
   נשמר ב-localStorage תחת 'sr_user_email').
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'sr_gam_v1:';
  var EMAIL_KEY = 'sr_user_email';

  /* ---------- הגדרת רמות ---------- */
  // סך ה-XP הדרוש כדי להגיע לרמה L = 50 * (L-1) * L
  //   רמה 1 = 0, רמה 2 = 100, רמה 3 = 300, רמה 4 = 600, רמה 5 = 1000 ...
  function totalXpForLevel(level) {
    return 50 * (level - 1) * level;
  }
  function levelFromXp(xp) {
    var lvl = 1;
    while (totalXpForLevel(lvl + 1) <= xp) lvl++;
    return lvl;
  }
  var LEVEL_TITLES = [
    'מתחיל',     // 1
    'חוקר',      // 2
    'פרקטיקנט',  // 3
    'מיישם',     // 4
    'מקצוען',    // 5
    'מומחה',     // 6
    'אלוף',      // 7
    'מאסטר',     // 8
    'אגדה'       // 9+
  ];
  function levelTitle(level) {
    return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1];
  }

  /* ---------- הגדרת תגים ---------- */
  // condition מקבל snapshot ומחזיר true אם התג מגיע (להענקה אוטומטית).
  var BADGES = [
    { id: 'first_step',    icon: '🎯', title: 'צעד ראשון',      desc: 'השלמת את הפעולה הראשונה שלך', condition: function (s) { return s.totalActivities >= 1; } },
    { id: 'seeker',        icon: '📚', title: 'צמא ידע',         desc: 'צפית ב-5 שיעורים',            condition: function (s) { return s.lessonsViewed >= 5; } },
    { id: 'finisher',      icon: '✅', title: 'מסיים',           desc: 'השלמת 3 שיעורים',             condition: function (s) { return s.lessonsCompleted >= 3; } },
    { id: 'streak_3',      icon: '🔥', title: '3 ימים ברצף',    desc: 'נכנסת 3 ימים ברצף',           condition: function (s) { return s.streak >= 3; } },
    { id: 'streak_7',      icon: '⚡', title: 'שבוע מושלם',      desc: 'נכנסת 7 ימים ברצף',           condition: function (s) { return s.streak >= 7; } },
    { id: 'level_5',       icon: '🏅', title: 'מקצוען',          desc: 'הגעת לרמה 5',                 condition: function (s) { return s.level >= 5; } },
    { id: 'xp_1000',       icon: '💎', title: '1000 נקודות',     desc: 'צברת 1000 XP',                condition: function (s) { return s.xp >= 1000; } },
    { id: 'game_perfect',  icon: '🌟', title: 'תרגול מושלם',     desc: 'סיימת תרגול ללא טעויות',       condition: null /* מוענק ידנית מהמשחק */ }
  ];
  function badgeById(id) {
    for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) return BADGES[i];
    return null;
  }

  /* ---------- XP ברירת מחדל לכל סוג פעולה ---------- */
  var ACTIVITY_XP = {
    lesson_view:     10,
    lesson_complete: 50,
    game_complete:   40,
    daily_login:      5
  };

  /* ---------- עזרי תאריך (לרצף) ---------- */
  function dayKey(d) {
    d = d || new Date();
    var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  function daysBetween(aKey, bKey) {
    var a = new Date(aKey + 'T00:00:00'), b = new Date(bKey + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  /* ════════════════════════════════════════════════════════════
     המחלקה הראשית
     ════════════════════════════════════════════════════════════ */
  function Gamification() {
    this.viewerId = null;
    this.mode = 'MOCK';
    this.state = null;
    this._listeners = { change: [], levelup: [], badge: [] };
    this._onSave = null;
    this._onLoad = null;
    this._bound = [];     // אלמנטים שמתרעננים אוטומטית
  }

  Gamification.prototype._defaultState = function () {
    return {
      xp: 0,
      badges: [],            // מערך של id-ים
      streak: 0,
      longestStreak: 0,
      lastActiveDay: null,   // 'YYYY-MM-DD'
      lessonsViewed: 0,
      lessonsCompleted: 0,
      gamesCompleted: 0,
      totalActivities: 0,
      history: []            // [{ ts, type, xp, reason }]
    };
  };

  Gamification.prototype._storageKey = function () {
    return STORAGE_PREFIX + (this.viewerId || 'anon');
  };

  Gamification.prototype._load = function () {
    if (typeof this._onLoad === 'function') {
      var ext = this._onLoad(this.viewerId);
      if (ext) return Object.assign(this._defaultState(), ext);
    }
    try {
      var raw = localStorage.getItem(this._storageKey());
      if (raw) return Object.assign(this._defaultState(), JSON.parse(raw));
    } catch (e) { /* no-op */ }
    return this._defaultState();
  };

  Gamification.prototype._save = function () {
    if (typeof this._onSave === 'function') {
      try { this._onSave(this.viewerId, this.state); } catch (e) { /* no-op */ }
    }
    try { localStorage.setItem(this._storageKey(), JSON.stringify(this.state)); } catch (e) { /* no-op */ }
  };

  /* ---------- אתחול ---------- */
  Gamification.prototype.init = function (opts) {
    opts = opts || {};
    this.viewerId = opts.viewerId || (function () {
      try { return localStorage.getItem(EMAIL_KEY); } catch (e) { return null; }
    })() || 'guest@demo';
    this.mode = opts.mode || 'MOCK';
    this._onSave = opts.onSave || null;
    this._onLoad = opts.onLoad || null;
    this.state = this._load();
    injectStyles();
    return this;
  };

  /* ---------- snapshot מחושב ---------- */
  Gamification.prototype.getState = function () {
    var s = this.state;
    var level = levelFromXp(s.xp);
    var floorXp = totalXpForLevel(level);
    var ceilXp = totalXpForLevel(level + 1);
    var into = s.xp - floorXp;
    var span = ceilXp - floorXp;
    return {
      xp: s.xp,
      level: level,
      levelTitle: levelTitle(level),
      xpIntoLevel: into,
      xpForNextLevel: span,
      xpToNext: span - into,
      pctToNext: span > 0 ? Math.round((into / span) * 100) : 100,
      streak: s.streak,
      longestStreak: s.longestStreak,
      lessonsViewed: s.lessonsViewed,
      lessonsCompleted: s.lessonsCompleted,
      gamesCompleted: s.gamesCompleted,
      totalActivities: s.totalActivities,
      badges: s.badges.map(badgeById).filter(Boolean),
      allBadges: BADGES.slice(),
      hasBadge: function (id) { return s.badges.indexOf(id) !== -1; }
    };
  };

  /* ---------- בדיקת תגים אוטומטית ---------- */
  Gamification.prototype._checkAutoBadges = function () {
    var snap = this.getState();
    var awarded = [];
    for (var i = 0; i < BADGES.length; i++) {
      var b = BADGES[i];
      if (!b.condition) continue;
      if (this.state.badges.indexOf(b.id) === -1 && b.condition(snap)) {
        this.state.badges.push(b.id);
        awarded.push(b);
      }
    }
    return awarded;
  };

  /* ---------- הוספת XP ---------- */
  Gamification.prototype.addXP = function (amount, reason) {
    amount = Math.max(0, amount | 0);
    var fromLevel = levelFromXp(this.state.xp);
    this.state.xp += amount;
    this.state.history.push({ ts: Date.now(), type: 'xp', xp: amount, reason: reason || '' });
    if (this.state.history.length > 200) this.state.history.shift();
    var toLevel = levelFromXp(this.state.xp);
    var newBadges = this._checkAutoBadges();
    this._save();

    var result = {
      gained: amount, totalXp: this.state.xp,
      leveledUp: toLevel > fromLevel, fromLevel: fromLevel, toLevel: toLevel,
      newBadges: newBadges
    };
    this._emit('change');
    if (result.leveledUp) this._emit('levelup', { fromLevel: fromLevel, toLevel: toLevel, title: levelTitle(toLevel) });
    newBadges.forEach(function (b) { this._emit('badge', b); }, this);
    this._refreshBound();
    return result;
  };

  /* ---------- תיעוד פעולה (כולל רצף) ---------- */
  Gamification.prototype.recordActivity = function (type, meta) {
    meta = meta || {};
    // עדכון רצף יומי
    var today = dayKey();
    if (this.state.lastActiveDay !== today) {
      if (this.state.lastActiveDay && daysBetween(this.state.lastActiveDay, today) === 1) {
        this.state.streak += 1;
      } else {
        this.state.streak = 1;
      }
      this.state.lastActiveDay = today;
      if (this.state.streak > this.state.longestStreak) this.state.longestStreak = this.state.streak;
    }
    // מונים ייעודיים
    if (type === 'lesson_view') this.state.lessonsViewed += 1;
    if (type === 'lesson_complete') this.state.lessonsCompleted += 1;
    if (type === 'game_complete') this.state.gamesCompleted += 1;
    this.state.totalActivities += 1;

    // XP ברירת מחדל (אלא אם נמסר xp מפורש, למשל 0)
    var xp = (typeof meta.xp === 'number') ? meta.xp : (ACTIVITY_XP[type] || 0);
    // addXP כבר שומר + מרענן
    return this.addXP(xp, meta.reason || type);
  };

  /* ---------- הענקת תג ידנית (למשל "תרגול מושלם" מהמשחק) ---------- */
  Gamification.prototype.awardBadge = function (id) {
    var b = badgeById(id);
    if (!b) return null;
    if (this.state.badges.indexOf(id) !== -1) return null; // כבר קיים
    this.state.badges.push(id);
    this._save();
    this._emit('change');
    this._emit('badge', b);
    this._refreshBound();
    return b;
  };

  /* ---------- איפוס (לדמו) ---------- */
  Gamification.prototype.reset = function () {
    this.state = this._defaultState();
    this._save();
    this._emit('change');
    this._refreshBound();
  };

  /* ---------- אירועים ---------- */
  Gamification.prototype.on = function (evt, cb) {
    if (this._listeners[evt]) this._listeners[evt].push(cb);
    return this;
  };
  Gamification.prototype._emit = function (evt, data) {
    (this._listeners[evt] || []).forEach(function (cb) {
      try { cb(data, this.getState()); } catch (e) { /* no-op */ }
    }, this);
  };

  /* ════════════════════════════════════════════════════════════
     רינדור — HUD קומפקטי + לוח מלא
     ════════════════════════════════════════════════════════════ */
  Gamification.prototype._refreshBound = function () {
    this._bound.forEach(function (entry) {
      if (!entry.el || !document.body.contains(entry.el)) return;
      if (entry.kind === 'hud') this._paintHUD(entry.el, entry.opts);
      else this._paintFull(entry.el, entry.opts);
    }, this);
  };

  Gamification.prototype.renderHUD = function (target, opts) {
    var el = resolveEl(target); if (!el) return;
    this._bound.push({ el: el, kind: 'hud', opts: opts || {} });
    this._paintHUD(el, opts || {});
    return el;
  };
  Gamification.prototype.renderFull = function (target, opts) {
    var el = resolveEl(target); if (!el) return;
    this._bound.push({ el: el, kind: 'full', opts: opts || {} });
    this._paintFull(el, opts || {});
    return el;
  };

  Gamification.prototype._paintHUD = function (el, opts) {
    var s = this.getState();
    el.className = 'srg-hud';
    el.innerHTML =
      '<div class="srg-hud-level" title="רמה ' + s.level + ' · ' + s.levelTitle + '">' +
        '<span class="srg-hud-level-num">' + s.level + '</span>' +
      '</div>' +
      '<div class="srg-hud-mid">' +
        '<div class="srg-hud-top">' +
          '<span class="srg-hud-title">' + s.levelTitle + '</span>' +
          '<span class="srg-hud-xp">' + s.xp + ' XP</span>' +
        '</div>' +
        '<div class="srg-bar"><div class="srg-bar-fill" style="width:' + s.pctToNext + '%"></div></div>' +
        '<div class="srg-hud-sub">' + s.xpToNext + ' נק\' לרמה הבאה</div>' +
      '</div>' +
      '<div class="srg-hud-streak" title="רצף יומי">' +
        '<span class="srg-flame' + (s.streak > 0 ? ' on' : '') + '">🔥</span>' +
        '<span class="srg-streak-num">' + s.streak + '</span>' +
      '</div>' +
      '<div class="srg-hud-badges" title="תגים שנאספו">' +
        '<span class="srg-badge-ico">🏅</span>' +
        '<span class="srg-badge-num">' + s.badges.length + '</span>' +
      '</div>';
  };

  Gamification.prototype._paintFull = function (el, opts) {
    var s = this.getState();
    var badgeCells = s.allBadges.map(function (b) {
      var owned = s.hasBadge(b.id);
      return '<div class="srg-badge-cell' + (owned ? ' owned' : '') + '" title="' + b.desc + '">' +
        '<div class="srg-badge-emoji">' + b.icon + '</div>' +
        '<div class="srg-badge-name">' + b.title + '</div>' +
        (owned ? '' : '<div class="srg-badge-lock">🔒</div>') +
        '</div>';
    }).join('');

    el.className = 'srg-full';
    el.innerHTML =
      '<div class="srg-card srg-level-card">' +
        '<div class="srg-ring" style="background:conic-gradient(var(--blue,#0992c2) ' + (s.pctToNext * 3.6) + 'deg, var(--line,#e2e8f0) 0deg)">' +
          '<div class="srg-ring-inner"><span class="srg-ring-lvl">' + s.level + '</span><span class="srg-ring-lbl">רמה</span></div>' +
        '</div>' +
        '<div class="srg-level-meta">' +
          '<div class="srg-level-title">' + s.levelTitle + '</div>' +
          '<div class="srg-level-xp">' + s.xp + ' נקודות ניסיון</div>' +
          '<div class="srg-bar lg"><div class="srg-bar-fill" style="width:' + s.pctToNext + '%"></div></div>' +
          '<div class="srg-level-next">עוד ' + s.xpToNext + ' נק\' לרמה ' + (s.level + 1) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="srg-stats">' +
        statCell('🔥', s.streak, 'רצף נוכחי') +
        statCell('🏆', s.longestStreak, 'רצף שיא') +
        statCell('📚', s.lessonsViewed, 'שיעורים נצפו') +
        statCell('✅', s.lessonsCompleted, 'שיעורים הושלמו') +
      '</div>' +
      '<div class="srg-card">' +
        '<div class="srg-section-title">התגים שלי <span class="srg-badge-count">' + s.badges.length + '/' + s.allBadges.length + '</span></div>' +
        '<div class="srg-badge-grid">' + badgeCells + '</div>' +
      '</div>';

    function statCell(ico, val, lbl) {
      return '<div class="srg-stat"><div class="srg-stat-ico">' + ico + '</div>' +
        '<div class="srg-stat-val">' + val + '</div><div class="srg-stat-lbl">' + lbl + '</div></div>';
    }
  };

  /* ---------- טוסט קופץ (level up / badge) ---------- */
  Gamification.prototype.showToast = function (html) {
    var host = document.getElementById('srg-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'srg-toast-host';
      document.body.appendChild(host);
    }
    var t = document.createElement('div');
    t.className = 'srg-toast';
    t.innerHTML = html;
    host.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 350);
    }, 3200);
  };

  /* ---------- עזרים ---------- */
  function resolveEl(target) {
    if (!target) return null;
    return typeof target === 'string' ? document.querySelector(target) : target;
  }

  /* ---------- הזרקת סגנונות (פעם אחת) ---------- */
  function injectStyles() {
    if (document.getElementById('srg-styles')) return;
    var css = ''
      + '.srg-hud{display:flex;align-items:center;gap:14px;background:var(--surface,#fff);border:1px solid var(--line,rgba(12,37,66,.12));border-radius:16px;padding:12px 16px;box-shadow:var(--shadow,0 10px 30px rgba(12,37,66,.10));font-family:var(--font-body,system-ui)}'
      + '.srg-hud-level{flex:0 0 auto;width:44px;height:44px;border-radius:50%;background:var(--grad-blue,linear-gradient(160deg,#0992c2,#5b99c3));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem}'
      + '.srg-hud-mid{flex:1;min-width:120px}'
      + '.srg-hud-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px}'
      + '.srg-hud-title{font-weight:700;color:var(--navy,#0c2542);font-size:.92rem}'
      + '.srg-hud-xp{font-size:.8rem;color:var(--blue,#0992c2);font-weight:700}'
      + '.srg-hud-sub{font-size:.72rem;color:var(--muted,#5a6b7a);margin-top:4px}'
      + '.srg-bar{background:var(--line,#e2e8f0);border-radius:99px;height:8px;overflow:hidden}'
      + '.srg-bar.lg{height:11px}'
      + '.srg-bar-fill{height:100%;background:var(--grad-blue,linear-gradient(90deg,#0992c2,#5b99c3));border-radius:99px;transition:width .5s cubic-bezier(.4,0,.2,1)}'
      + '.srg-hud-streak,.srg-hud-badges{flex:0 0 auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:34px}'
      + '.srg-flame{font-size:1.2rem;filter:grayscale(1);opacity:.5}'
      + '.srg-flame.on{filter:none;opacity:1}'
      + '.srg-streak-num,.srg-badge-num{font-weight:800;color:var(--navy,#0c2542);font-size:.85rem}'
      + '.srg-badge-ico{font-size:1.1rem}'
      // full
      + '.srg-full{display:flex;flex-direction:column;gap:18px;font-family:var(--font-body,system-ui)}'
      + '.srg-card{background:var(--surface,#fff);border:1px solid var(--line,rgba(12,37,66,.12));border-radius:18px;padding:22px;box-shadow:var(--shadow,0 10px 30px rgba(12,37,66,.08))}'
      + '.srg-level-card{display:flex;align-items:center;gap:22px}'
      + '.srg-ring{flex:0 0 auto;width:104px;height:104px;border-radius:50%;display:flex;align-items:center;justify-content:center}'
      + '.srg-ring-inner{width:80px;height:80px;border-radius:50%;background:var(--surface,#fff);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}'
      + '.srg-ring-lvl{font-size:1.9rem;font-weight:800;color:var(--navy,#0c2542)}'
      + '.srg-ring-lbl{font-size:.7rem;color:var(--muted,#5a6b7a);margin-top:2px}'
      + '.srg-level-meta{flex:1;min-width:0}'
      + '.srg-level-title{font-size:1.35rem;font-weight:800;color:var(--navy,#0c2542)}'
      + '.srg-level-xp{font-size:.85rem;color:var(--blue,#0992c2);font-weight:700;margin:4px 0 12px}'
      + '.srg-level-next{font-size:.78rem;color:var(--muted,#5a6b7a);margin-top:8px}'
      + '.srg-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}'
      + '@media(max-width:560px){.srg-stats{grid-template-columns:repeat(2,1fr)}}'
      + '.srg-stat{background:var(--surface,#fff);border:1px solid var(--line,rgba(12,37,66,.12));border-radius:14px;padding:14px 8px;text-align:center}'
      + '.srg-stat-ico{font-size:1.4rem}'
      + '.srg-stat-val{font-size:1.5rem;font-weight:800;color:var(--navy,#0c2542);margin:2px 0}'
      + '.srg-stat-lbl{font-size:.72rem;color:var(--muted,#5a6b7a)}'
      + '.srg-section-title{font-weight:800;color:var(--navy,#0c2542);font-size:1.05rem;margin-bottom:16px;display:flex;align-items:center;gap:8px}'
      + '.srg-badge-count{font-size:.78rem;background:var(--bg,#f5f8fc);color:var(--blue,#0992c2);padding:2px 10px;border-radius:99px;font-weight:700}'
      + '.srg-badge-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:12px}'
      + '.srg-badge-cell{position:relative;background:var(--bg,#f5f8fc);border:1px solid var(--line,rgba(12,37,66,.12));border-radius:14px;padding:14px 6px;text-align:center;opacity:.55;transition:transform .15s}'
      + '.srg-badge-cell.owned{opacity:1;border-color:var(--blue,#0992c2);background:#fff}'
      + '.srg-badge-cell.owned:hover{transform:translateY(-3px)}'
      + '.srg-badge-emoji{font-size:1.9rem;line-height:1}'
      + '.srg-badge-name{font-size:.74rem;font-weight:700;color:var(--navy,#0c2542);margin-top:6px}'
      + '.srg-badge-lock{position:absolute;top:6px;left:8px;font-size:.7rem;opacity:.6}'
      // toast
      + '#srg-toast-host{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none}'
      + '.srg-toast{background:var(--navy,#0c2542);color:#fff;border-radius:14px;padding:14px 22px;font-family:var(--font-body,system-ui);font-weight:700;box-shadow:0 12px 34px rgba(12,37,66,.35);opacity:0;transform:translateY(16px) scale(.96);transition:all .35s cubic-bezier(.2,.8,.2,1);text-align:center;max-width:90vw}'
      + '.srg-toast.show{opacity:1;transform:translateY(0) scale(1)}'
      + '.srg-toast .srg-toast-emoji{font-size:1.5rem;display:block;margin-bottom:4px}'
      + '.srg-toast .srg-toast-sub{font-weight:500;font-size:.82rem;opacity:.85;margin-top:2px}';
    var st = document.createElement('style');
    st.id = 'srg-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- חשיפה גלובלית (singleton) ---------- */
  var instance = new Gamification();
  // קיצורי-דרך נוחים שמחברים אירועים לטוסטים יפים כברירת מחדל
  instance.on('levelup', function (data) {
    instance.showToast('<span class="srg-toast-emoji">🎉</span>עלית לרמה ' + data.toLevel + '!<div class="srg-toast-sub">' + data.title + '</div>');
  });
  instance.on('badge', function (b) {
    instance.showToast('<span class="srg-toast-emoji">' + b.icon + '</span>תג חדש: ' + b.title + '<div class="srg-toast-sub">' + b.desc + '</div>');
  });

  window.SRGamification = instance;
  // חשיפת קבועים שימושיים למודולים אחרים
  window.SRGamification.BADGES = BADGES;
  window.SRGamification.levelTitle = levelTitle;
  window.SRGamification.levelFromXp = levelFromXp;
})();
