/* ════════════════════════════════════════════════════════════
   leaderboard.js — טבלת מובילים / תחרות התקדמות (סקייל רווחי)
   ────────────────────────────────────────────────────────────
   דירוג חודשי לפי כמה מדדים: צפיות, יישום, אפיליאציות, וכללי (XP).
   מתחדש בתחילת כל חודש. במצב MOCK הנתונים מקומיים; ב-LIVE הם
   מגיעים מ-view מצרפי ב-Supabase (ראו INTEGRATION.md).
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ---------- נתוני דמה: משתתפים ---------- */
  // views = שיעורים שנצפו, applied = משימות יישום שסומנו, affiliates = הפניות שהצליחו
  var MOCK_PARTICIPANTS = [
    { id: 'p1',  name: 'רותם לוי',     views: 42, applied: 18, affiliates: 6, xp: 1240 },
    { id: 'p2',  name: 'דניאל כהן',    views: 38, applied: 22, affiliates: 3, xp: 1180 },
    { id: 'p3',  name: 'מאיה בר',      views: 51, applied: 14, affiliates: 9, xp: 1610 },
    { id: 'p4',  name: 'יוסי אברהם',   views: 27, applied: 11, affiliates: 2, xp: 720  },
    { id: 'p5',  name: 'נועה פרידמן',  views: 33, applied: 19, affiliates: 5, xp: 980  },
    { id: 'p6',  name: 'איתי שמש',     views: 19, applied: 7,  affiliates: 1, xp: 430  },
    { id: 'p7',  name: 'שירה גולן',    views: 46, applied: 25, affiliates: 7, xp: 1490 },
    { id: 'p8',  name: 'עומר דהן',     views: 22, applied: 9,  affiliates: 4, xp: 610  },
    { id: 'p9',  name: 'טל רוזן',      views: 30, applied: 12, affiliates: 0, xp: 840  },
    { id: 'p10', name: 'ליאור אדרי',   views: 15, applied: 5,  affiliates: 2, xp: 350  }
  ];

  var METRICS = [
    { key: 'xp',         label: 'כללי',      icon: '⭐', suffix: 'XP',   desc: 'ניקוד כולל מכל הפעילות בפורטל' },
    { key: 'views',      label: 'צפיות',     icon: '📺', suffix: '',     desc: 'מספר השיעורים שנצפו החודש' },
    { key: 'applied',    label: 'יישום',     icon: '🛠️', suffix: '',     desc: 'משימות יישום שהושלמו החודש' },
    { key: 'affiliates', label: 'אפיליאציות', icon: '🤝', suffix: '',    desc: 'הפניות מוצלחות החודש' }
  ];

  var HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

  function Leaderboard(opts) {
    this.root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
    this.metric = opts.metric || 'xp';
    this.meName = opts.meName || 'אתה';
    this.meId = 'me';
    this._buildMe(opts.meXp);
  }

  // משלב את המשתמש הנוכחי בטבלה. אם יש גיימיפיקציה חיה — מושך XP אמיתי.
  Leaderboard.prototype._buildMe = function (meXp) {
    var xp = (typeof meXp === 'number') ? meXp
      : (window.SRGamification && window.SRGamification.state ? window.SRGamification.getState().xp : 540);
    // צפיות/יישום נגזרים גם הם מהגיימיפיקציה אם קיימת
    var g = (window.SRGamification && window.SRGamification.state) ? window.SRGamification.getState() : null;
    this.me = {
      id: 'me',
      name: this.meName,
      views: g ? g.lessonsViewed : 8,
      applied: g ? g.lessonsCompleted : 4,
      affiliates: 1,
      xp: xp,
      isMe: true
    };
  };

  Leaderboard.prototype._rows = function () {
    return MOCK_PARTICIPANTS.concat([this.me]);
  };

  /* ---------- ספירה לאחור לאיפוס חודשי ---------- */
  function resetInfo() {
    var now = new Date();
    var endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    var daysLeft = Math.ceil((endOfMonth - now) / 86400000);
    return { monthName: HEB_MONTHS[now.getMonth()], year: now.getFullYear(), daysLeft: daysLeft };
  }

  /* ---------- רינדור ---------- */
  Leaderboard.prototype.render = function () {
    var self = this;
    var metricDef = METRICS.filter(function (m) { return m.key === self.metric; })[0];
    var rows = this._rows().slice().sort(function (a, b) { return b[self.metric] - a[self.metric]; });
    var meRank = rows.findIndex(function (r) { return r.isMe; }) + 1;
    var ri = resetInfo();

    var tabs = METRICS.map(function (m) {
      return '<button class="lb-tab' + (m.key === self.metric ? ' active' : '') + '" data-m="' + m.key + '">' +
        '<span class="lb-tab-ico">' + m.icon + '</span>' + m.label + '</button>';
    }).join('');

    // פודיום (3 ראשונים)
    var podium = '';
    if (rows.length >= 3) {
      var order = [1, 0, 2]; // שמאל=2, אמצע=1, ימין=3 (ויזואלית האמצע גבוה)
      podium = '<div class="lb-podium">' + order.map(function (pos) {
        var r = rows[pos];
        var place = pos + 1;
        return '<div class="lb-pod lb-pod-' + place + (r.isMe ? ' me' : '') + '">' +
          '<div class="lb-pod-medal">' + (place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉') + '</div>' +
          '<div class="lb-avatar">' + initials(r.name) + '</div>' +
          '<div class="lb-pod-name">' + esc(r.name) + '</div>' +
          '<div class="lb-pod-val">' + r[self.metric] + ' ' + metricDef.suffix + '</div>' +
          '<div class="lb-pod-bar"></div>' +
        '</div>';
      }).join('') + '</div>';
    }

    // שאר הרשימה (מקום 4 ומטה)
    var listRows = rows.map(function (r, i) {
      return '<div class="lb-row' + (r.isMe ? ' me' : '') + '">' +
        '<div class="lb-rank">' + (i + 1) + '</div>' +
        '<div class="lb-avatar sm">' + initials(r.name) + '</div>' +
        '<div class="lb-name">' + esc(r.name) + (r.isMe ? ' <span class="lb-you">אתה</span>' : '') + '</div>' +
        '<div class="lb-val">' + r[self.metric] + ' <span class="lb-suffix">' + metricDef.suffix + '</span></div>' +
      '</div>';
    }).join('');

    this.root.innerHTML =
      '<div class="lb-head">' +
        '<div>' +
          '<div class="lb-title">טבלת המובילים</div>' +
          '<div class="lb-period">🗓️ ' + ri.monthName + ' ' + ri.year + ' · מתאפס בעוד ' + ri.daysLeft + ' ימים</div>' +
        '</div>' +
        '<div class="lb-myrank" title="הדירוג שלך">#' + meRank + '</div>' +
      '</div>' +
      '<div class="lb-tabs">' + tabs + '</div>' +
      '<div class="lb-metric-desc">' + metricDef.icon + ' ' + metricDef.desc + '</div>' +
      podium +
      '<div class="lb-list">' + listRows + '</div>' +
      '<div class="lb-foot">הדירוג מתעדכן בזמן אמת. בתחילת כל חודש המונים מתאפסים ומתחילים מירוץ חדש.</div>';

    this.root.querySelectorAll('.lb-tab').forEach(function (t) {
      t.addEventListener('click', function () { self.metric = t.dataset.m; self.render(); });
    });
  };

  /* ---------- עזרים ---------- */
  function initials(name) {
    var parts = String(name).trim().split(/\s+/);
    return (parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.SRLeaderboard = Leaderboard;
})();
