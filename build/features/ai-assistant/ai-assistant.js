/* ════════════════════════════════════════════════════════════
   ai-assistant.js — עוזר AI אישי ("כמו מורה") · סקייל רווחי
   ────────────────────────────────────────────────────────────
   widget צ'אט צף שמבוסס על תוכן השיעור הנוכחי. עונה לשאלות הלומד.

   🔌 callLLM שולח POST אמיתי ל-Edge Function 'lesson-tutor'.
      body: { question, lessonOrder, userEmail }
      response: { answer }
      השרת שומר ומנהל את ההיסטוריה בעצמו — אין צורך לשלוח history מהלקוח.
      ANON key ציבורי-בטוח — לא secret. אסור לכתוב service_role בקוד.

   💾 זיכרון פר-משתמש:
      זהות = localStorage.getItem('sr_user_email')
      בעת mount: שולח action:'history' → מרנדר שיחה קודמת.
      בכל שאלה: שולח userEmail → השרת שומר.

   📦 API ציבורי:
      window.SRTutor.mount({ el?, lessonOrder? })
        el         — HTMLElement להטמעה (אם אין — וידג'ט צף)
        lessonOrder — number|null (null = מורה כללי)
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ---------- קונפיגורציה ---------- */
  var EDGE_URL   = 'https://mcpprxujlgpdkgnjjunf.supabase.co/functions/v1/lesson-tutor';
  var ANON_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jcHByeHVqbGdwZGtnbmpqdW5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzM3ODIsImV4cCI6MjA5NzM0OTc4Mn0.rTgP-j2smBjzV4ixT7Ea0I0leOAErVLN5F5aULDNHM4';

  function SRAssistant(opts) {
    opts = opts || {};
    this.lesson = opts.lesson || { id: 'lsn-1', title: 'השיעור', summary: '', knowledge: [] };
    this.mode = opts.mode || 'MOCK';
    this.lessonOrder = (opts.lessonOrder !== undefined) ? opts.lessonOrder : null;
    this.containerEl = opts.el || null;      // HTMLElement להטמעה, או null לצף
    this.userEmail = localStorage.getItem('sr_user_email') || null;  // זהות משתמש — נשמר בהרשמה
    this.history = [];                        // [{role:'user'|'assistant', text}] — עותק לוקאלי לעיבוד תצוגה
    this.open = false;
    injectStyles();
    this._mount();
    this._loadHistory();  // טעינת היסטוריה מהשרת לפני ברכה
  }

  /* ---------- בניית ה-DOM של ה-widget ---------- */
  SRAssistant.prototype._mount = function () {
    var self = this;
    var uid = 'ai' + Math.random().toString(36).slice(2, 7);  // ייחודי לכל instance
    var isEmbedded = !!this.containerEl;

    var wrap = document.createElement('div');
    wrap.className = isEmbedded ? 'ai-widget ai-embedded' : 'ai-widget';
    wrap.innerHTML =
      (isEmbedded ? '' :
        '<button class="ai-launcher" id="' + uid + '-launcher" aria-label="עוזר אישי">' +
          '<span class="ai-launcher-ico">💬</span>' +
          '<span class="ai-launcher-txt">שאל את המורה</span>' +
        '</button>'
      ) +
      '<div class="ai-panel' + (isEmbedded ? ' open ai-panel-embedded' : '') + '" id="' + uid + '-panel" role="dialog" aria-label="עוזר AI">' +
        '<div class="ai-head">' +
          '<div class="ai-head-info">' +
            '<div class="ai-avatar">🧠</div>' +
            '<div><div class="ai-head-title">המורה האישי</div>' +
            '<div class="ai-head-sub">' + esc(this.lesson.title) + '</div></div>' +
          '</div>' +
          (isEmbedded ? '' : '<button class="ai-close" id="' + uid + '-close" aria-label="סגור">✕</button>') +
        '</div>' +
        '<div class="ai-msgs" id="' + uid + '-msgs"></div>' +
        '<div class="ai-suggest" id="' + uid + '-suggest"></div>' +
        '<form class="ai-input" id="' + uid + '-form">' +
          '<input id="' + uid + '-text" type="text" placeholder="שאל כל שאלה על השיעור…" autocomplete="off">' +
          '<button type="submit" aria-label="שלח">➤</button>' +
        '</form>' +
        '<div class="ai-disclaimer">העוזר מבוסס על תוכן השיעור בלבד.</div>' +
      '</div>';

    if (isEmbedded) {
      this.containerEl.appendChild(wrap);
    } else {
      document.body.appendChild(wrap);
    }

    this.elPanel   = wrap.querySelector('#' + uid + '-panel');
    this.elMsgs    = wrap.querySelector('#' + uid + '-msgs');
    this.elSuggest = wrap.querySelector('#' + uid + '-suggest');
    this.elText    = wrap.querySelector('#' + uid + '-text');

    if (!isEmbedded) {
      wrap.querySelector('#' + uid + '-launcher').addEventListener('click', function () { self.toggle(true); });
      wrap.querySelector('#' + uid + '-close').addEventListener('click', function () { self.toggle(false); });
    }
    wrap.querySelector('#' + uid + '-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = self.elText.value.trim();
      if (v) { self._send(v); self.elText.value = ''; }
    });
    this._renderSuggestions();
  };

  SRAssistant.prototype.toggle = function (open) {
    this.open = (open == null) ? !this.open : open;
    this.elPanel.classList.toggle('open', this.open);
    if (this.open) setTimeout(function(){}, 0), this.elText.focus();
  };

  /* ---------- טעינת היסטוריית שיחה מהשרת ---------- */
  SRAssistant.prototype._loadHistory = function () {
    var self = this;
    // אין מייל — התחל ריק עם ברכה רגילה
    if (!this.userEmail) {
      this._greet();
      return;
    }
    fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY
      },
      body: JSON.stringify({ action: 'history', userEmail: self.userEmail })
    })
    .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
    .then(function (data) {
      var msgs = (data && Array.isArray(data.messages)) ? data.messages : [];
      if (msgs.length === 0) {
        self._greet();
        return;
      }
      // רנדור הודעות קודמות — לפני שהמשתמש מתחיל
      msgs.forEach(function (m) {
        var role = (m.role === 'user') ? 'user' : 'assistant';
        self._addMsg(role, m.content);
        self.history.push({ role: role, text: m.content });
      });
      // הודעת חזרה קצרה במקום ברכה ראשונה
      self._addMsg('assistant', 'ברוך שובך! אני זוכר את השיחה שלנו. במה נמשיך?');
    })
    .catch(function (err) {
      // שגיאה בטעינה — מתחיל ריק בשקט
      console.warn('[SRTutor] history load failed', err);
      self._greet();
    });
  };

  /* ---------- הודעת פתיחה + הצעות ----------
     אם המשתמש כבר מילא שאלון (sr_concern קיים) — לא מבקשים ממנו לספר על העסק
     מחדש; השרת כבר מקבל את נתוני השאלון לפי המייל ומתאים את עצמו. */
  SRAssistant.prototype._greet = function () {
    var hasSurvey = !!localStorage.getItem('sr_concern');
    if (hasSurvey) {
      this._addMsg('assistant',
        'היי 🙂 אני המורה האישי שלך כאן.\n' +
        'כבר ראיתי מה מילאת בשאלון, אז אני מכיר את התמונה אצלך. ' +
        'שאל אותי כל שאלה על השיעור — ואתאים לך את התשובות בדיוק למצב שלך.'
      );
    } else {
      this._addMsg('assistant',
        'היי 🙂 אני המורה האישי שלך כאן.\n' +
        'כדי שאוכל לתת לך דוגמאות מהשיעורים שמדברות בדיוק עליך — ' +
        'ספר לי בכמה מילים: מה העסק שלך, ומה הכי בוער לך לפצח עכשיו?'
      );
    }
  };

  SRAssistant.prototype._renderSuggestions = function () {
    var sugg = (this.lesson.suggestions && this.lesson.suggestions.length)
      ? this.lesson.suggestions
      : ['תן לי תקציר של השיעור', 'תן דוגמה מהחיים', 'מה הצעד הראשון שאני עושה?'];
    var self = this;
    this.elSuggest.innerHTML = sugg.map(function (s) {
      return '<button class="ai-chip">' + esc(s) + '</button>';
    }).join('');
    this.elSuggest.querySelectorAll('.ai-chip').forEach(function (c) {
      c.addEventListener('click', function () { self._send(c.textContent); });
    });
  };

  /* ---------- שליחת הודעה ---------- */
  SRAssistant.prototype._send = function (text) {
    var self = this;
    this._addMsg('user', text);
    this.history.push({ role: 'user', text: text });
    this.elSuggest.style.display = 'none';
    this._showTyping();

    this.callLLM(text).then(function (answer) {
      self._hideTyping();
      self._addMsg('assistant', answer);
      self.history.push({ role: 'assistant', text: answer });
    }).catch(function () {
      self._hideTyping();
      self._addMsg('assistant', 'אופס, משהו השתבש. נסה שוב בעוד רגע.');
    });
  };

  /* ════════════════════════════════════════════════════════════
     🔌 callLLM — חיבור אמיתי ל-Edge Function
     ────────────────────────────────────────────────────────────
     POST https://.../functions/v1/lesson-tutor
     body:     { question, lessonOrder, userEmail }
     response: { answer }
     השרת שומר ומנהל את ההיסטוריה — הלקוח שולח רק את השאלה + זהות.
     שגיאות רשת / שרת → הודעה ידידותית בעברית, לא throw.
     ════════════════════════════════════════════════════════════ */
  SRAssistant.prototype.callLLM = function (question) {
    var self = this;
    return fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY
      },
      body: JSON.stringify({
        question: question,
        lessonOrder: self.lessonOrder,       // number|null — מאפשר למורה לדעת איזה שיעור
        userEmail: self.userEmail || null    // זהות משתמש — השרת שומר היסטוריה לפיו
      })
    })
    .then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          console.warn('[SRTutor] Edge Function error', res.status, err);
          return { answer: 'רגע, משהו השתבש. נסה שוב בעוד רגע.' };
        });
      }
      return res.json();
    })
    .then(function (data) {
      return (data && data.answer) ? data.answer : 'רגע, משהו השתבש. נסה שוב בעוד רגע.';
    })
    .catch(function (err) {
      console.warn('[SRTutor] fetch failed', err);
      return 'רגע, משהו השתבש. נסה שוב בעוד רגע.';
    });
  };

  /* ---------- מנוע תשובות דמה מבוסס ידע-שיעור ---------- */
  SRAssistant.prototype._mockRespond = function (text) {
    var t = text.toLowerCase();
    var L = this.lesson;

    // תקציר/סיכום
    if (/(תקציר|סכם|סיכום|בקצרה|על מה)/.test(t)) {
      return L.summary
        ? 'בקצרה: ' + L.summary
        : 'השיעור "' + L.title + '" עוסק בעקרונות המרכזיים של הנושא. רוצה שאתמקד בנקודה מסוימת?';
    }
    // דוגמה
    if (/(דוגמ|תרחיש|מהחיים|לדוגמה)/.test(t)) {
      if (L.example) return L.example;
    }
    // צעד ראשון / מה עושים
    if (/(צעד ראשון|מאיפה מתחיל|מה אני עושה|איך מתחיל|practical|ליישם)/.test(t)) {
      if (L.firstStep) return L.firstStep;
    }
    // חיפוש בידע השיעור לפי מילות מפתח
    var best = null, bestScore = 0;
    (L.knowledge || []).forEach(function (k) {
      var score = 0;
      (k.keywords || []).forEach(function (kw) { if (t.indexOf(kw.toLowerCase()) !== -1) score++; });
      if (score > bestScore) { bestScore = score; best = k; }
    });
    if (best && bestScore > 0) return best.a;

    // ברירת מחדל — מחזיר לשיעור, מזמין להעמיק
    return 'שאלה טובה. בשיעור "' + L.title + '" ' +
      (L.summary ? 'דיברנו על כך ש' + lower(L.summary) + ' ' : '') +
      'רוצה שאסביר את זה אחרת, או אתן דוגמה מעשית?';
  };

  /* ---------- ניהול הודעות ב-DOM ---------- */
  SRAssistant.prototype._addMsg = function (role, text) {
    var div = document.createElement('div');
    div.className = 'ai-msg ' + role;
    div.innerHTML = '<div class="ai-bubble">' + esc(text) + '</div>';
    this.elMsgs.appendChild(div);
    this.elMsgs.scrollTop = this.elMsgs.scrollHeight;
  };
  SRAssistant.prototype._showTyping = function () {
    var div = document.createElement('div');
    div.className = 'ai-msg assistant ai-typing';
    div.id = 'ai-typing';
    div.innerHTML = '<div class="ai-bubble"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>';
    this.elMsgs.appendChild(div);
    this.elMsgs.scrollTop = this.elMsgs.scrollHeight;
  };
  SRAssistant.prototype._hideTyping = function () {
    var t = document.getElementById('ai-typing');
    if (t) t.remove();
  };

  /* ---------- עזרים ---------- */
  function lower(s) { return s.charAt(0) + s.slice(1); } // שמירת עברית כמו שהיא
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- סגנונות (פעם אחת — כולל מצב embedded) ---------- */
  function injectStyles() {
    if (document.getElementById('ai-styles')) return;
    var css = ''
      + '.ai-widget{position:fixed;bottom:20px;left:20px;z-index:9998;font-family:var(--font-body,system-ui)}'
      + '.ai-widget.ai-embedded{position:relative;bottom:auto;left:auto;width:100%;height:100%}'
      + '.ai-launcher{display:flex;align-items:center;gap:8px;background:var(--navy,#0c2542);color:#fff;border:0;border-radius:99px;padding:12px 20px;font-family:inherit;font-weight:700;font-size:.92rem;cursor:pointer;box-shadow:0 10px 30px rgba(12,37,66,.30);transition:transform .15s}'
      + '.ai-launcher:hover{transform:translateY(-2px)}'
      + '.ai-launcher-ico{font-size:1.1rem}'
      + '.ai-panel{position:absolute;bottom:64px;left:0;width:min(380px,calc(100vw - 40px));height:min(560px,calc(100vh - 120px));background:var(--surface,#fff);border:1px solid var(--line,rgba(12,37,66,.12));border-radius:20px;box-shadow:0 24px 60px rgba(12,37,66,.28);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(16px) scale(.97);pointer-events:none;transition:all .25s cubic-bezier(.2,.8,.2,1)}'
      + '.ai-panel.open{opacity:1;transform:none;pointer-events:auto}'
      + '.ai-panel-embedded{position:relative;bottom:auto;left:auto;width:100%;height:100%;max-width:none;max-height:none;border-radius:16px;opacity:1;transform:none;pointer-events:auto}'
      + '.ai-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--navy,#0c2542);color:#fff}'
      + '.ai-head-info{display:flex;align-items:center;gap:10px}'
      + '.ai-avatar{width:38px;height:38px;border-radius:50%;background:var(--grad-blue,linear-gradient(160deg,#0992c2,#5b99c3));display:flex;align-items:center;justify-content:center;font-size:1.1rem}'
      + '.ai-head-title{font-weight:800;font-size:.95rem}'
      + '.ai-head-sub{font-size:.74rem;opacity:.8;margin-top:1px}'
      + '.ai-close{background:rgba(255,255,255,.15);border:0;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:.85rem}'
      + '.ai-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#f5f8fc)}'
      + '.ai-msg{display:flex}'
      + '.ai-msg.assistant{justify-content:flex-start}'
      + '.ai-bubble{max-width:80%;padding:10px 13px;border-radius:14px;font-size:.9rem;line-height:1.55;white-space:pre-wrap}'
      + '.ai-msg.assistant .ai-bubble{background:#fff;color:var(--navy,#0c2542);border:1px solid var(--line,rgba(12,37,66,.10));border-top-right-radius:4px}'
      + '.ai-msg.user{justify-content:flex-end}'
      + '.ai-msg.user .ai-bubble{background:var(--blue,#0992c2);color:#fff;border-top-left-radius:4px}'
      + '.ai-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--muted,#5a6b7a);margin:0 2px;animation:aibounce 1.2s infinite}'
      + '.ai-dot:nth-child(2){animation-delay:.15s}.ai-dot:nth-child(3){animation-delay:.3s}'
      + '@keyframes aibounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}'
      + '.ai-suggest{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px;background:var(--bg,#f5f8fc);border-top:1px solid var(--line,rgba(12,37,66,.08))}'
      + '.ai-chip{background:#fff;border:1px solid var(--blue,#0992c2);color:var(--blue,#0992c2);border-radius:99px;padding:6px 12px;font-family:inherit;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s}'
      + '.ai-chip:hover{background:var(--blue,#0992c2);color:#fff}'
      + '.ai-input{display:flex;gap:8px;padding:12px;background:var(--surface,#fff);border-top:1px solid var(--line,rgba(12,37,66,.10))}'
      + '.ai-input input{flex:1;border:1px solid var(--line,rgba(12,37,66,.18));border-radius:12px;padding:10px 12px;font-family:inherit;font-size:.9rem;color:var(--navy,#0c2542)}'
      + '.ai-input input:focus{outline:none;border-color:var(--blue,#0992c2)}'
      + '.ai-input button{flex:0 0 auto;width:42px;border:0;border-radius:12px;background:var(--navy,#0c2542);color:#fff;font-size:1rem;cursor:pointer}'
      + '.ai-disclaimer{font-size:.68rem;color:var(--muted,#5a6b7a);text-align:center;padding:6px 10px 10px;background:var(--surface,#fff)}';
    var st = document.createElement('style');
    st.id = 'ai-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ════════════════════════════════════════════════════════════
     window.SRTutor — API ציבורי נקי לדפים אחרים בפורטל
     ════════════════════════════════════════════════════════════
     window.SRTutor.mount({
       el?:          HTMLElement  — קונטיינר להטמעה (אם אין: וידג'ט צף)
       lessonOrder?: number|null  — מספר שיעור (null = מורה כללי)
       lesson?:      object       — מטא-דאטה לוקאלי (title, suggestions…)
     })
     מחזיר את ה-SRAssistant instance.
  ════════════════════════════════════════════════════════════ */
  window.SRTutor = {
    mount: function (opts) {
      opts = opts || {};
      return new SRAssistant({
        lesson:      opts.lesson      || { id: null, title: 'המורה האישי', summary: '', knowledge: [] },
        lessonOrder: (opts.lessonOrder !== undefined) ? opts.lessonOrder : null,
        el:          opts.el          || null,
        mode:        'LIVE'
      });
    }
  };

  /* שמירה לאחור לקוד ישן שמשתמש ב-SRAssistant ישירות */
  window.SRAssistant = SRAssistant;

})();
