/* ════════════════════════════════════════════════════════════
   ai-assistant.js — עוזר AI אישי ("כמו מורה") · סקייל רווחי
   ────────────────────────────────────────────────────────────
   widget צ'אט צף שמבוסס על תוכן השיעור הנוכחי. עונה לשאלות הלומד.
   כרגע (MOCK) התשובות מקומיות ומבוססות על "ידע השיעור" שמוזן אליו.

   🔌 נקודת החיבור היחידה ל-LLM היא הפונקציה callLLM() למטה.
      במצב LIVE היא שולחת POST ל-Edge Function ('lesson-tutor')
      עם הקשר השיעור + היסטוריית השיחה. ראו INTEGRATION.md.
      אסור לקרוא ל-LLM ישירות מהדפדפן עם מפתח — תמיד דרך Edge Function.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function SRAssistant(opts) {
    opts = opts || {};
    this.lesson = opts.lesson || { id: 'lsn-1', title: 'השיעור', summary: '', knowledge: [] };
    this.mode = opts.mode || 'MOCK';
    this.endpoint = opts.endpoint || null;   // ב-LIVE: URL של ה-Edge Function
    this.history = [];                         // [{role:'user'|'assistant', text}]
    this.open = false;
    injectStyles();
    this._mount();
    this._greet();
  }

  /* ---------- בניית ה-DOM של ה-widget ---------- */
  SRAssistant.prototype._mount = function () {
    var self = this;
    var wrap = document.createElement('div');
    wrap.className = 'ai-widget';
    wrap.innerHTML =
      '<button class="ai-launcher" id="ai-launcher" aria-label="עוזר אישי">' +
        '<span class="ai-launcher-ico">💬</span>' +
        '<span class="ai-launcher-txt">שאל את המורה</span>' +
      '</button>' +
      '<div class="ai-panel" id="ai-panel" role="dialog" aria-label="עוזר AI">' +
        '<div class="ai-head">' +
          '<div class="ai-head-info">' +
            '<div class="ai-avatar">🧠</div>' +
            '<div><div class="ai-head-title">המורה האישי</div>' +
            '<div class="ai-head-sub">' + esc(this.lesson.title) + '</div></div>' +
          '</div>' +
          '<button class="ai-close" id="ai-close" aria-label="סגור">✕</button>' +
        '</div>' +
        '<div class="ai-msgs" id="ai-msgs"></div>' +
        '<div class="ai-suggest" id="ai-suggest"></div>' +
        '<form class="ai-input" id="ai-form">' +
          '<input id="ai-text" type="text" placeholder="שאל כל שאלה על השיעור…" autocomplete="off">' +
          '<button type="submit" aria-label="שלח">➤</button>' +
        '</form>' +
        '<div class="ai-disclaimer">העוזר מבוסס על תוכן השיעור. תשובות לדוגמה במצב הדגמה.</div>' +
      '</div>';
    document.body.appendChild(wrap);
    this.elPanel = wrap.querySelector('#ai-panel');
    this.elMsgs = wrap.querySelector('#ai-msgs');
    this.elSuggest = wrap.querySelector('#ai-suggest');
    this.elText = wrap.querySelector('#ai-text');

    wrap.querySelector('#ai-launcher').addEventListener('click', function () { self.toggle(true); });
    wrap.querySelector('#ai-close').addEventListener('click', function () { self.toggle(false); });
    wrap.querySelector('#ai-form').addEventListener('submit', function (e) {
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

  /* ---------- הודעת פתיחה + הצעות ---------- */
  SRAssistant.prototype._greet = function () {
    this._addMsg('assistant', 'היי! אני המורה האישי שלך לשיעור "' + this.lesson.title + '". ' +
      'אפשר לשאול אותי כל דבר על החומר — אסביר, אתן דוגמה, או אסכם. במה נתחיל?');
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
     🔌 callLLM — נקודת החיבור היחידה ל-LLM
     ────────────────────────────────────────────────────────────
     MOCK → מגיב מקומית מתוך ידע השיעור.
     LIVE → POST ל-Edge Function עם הקשר השיעור + ההיסטוריה.
     ════════════════════════════════════════════════════════════ */
  SRAssistant.prototype.callLLM = function (userText) {
    var self = this;
    if (this.mode === 'LIVE' && this.endpoint) {
      return fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: this.lesson.id,
          lesson_title: this.lesson.title,
          lesson_context: this.lesson.summary,    // בשרת: גם תמלול מלא מ-Supabase
          history: this.history,
          question: userText
        })
      }).then(function (r) { return r.json(); }).then(function (d) { return d.answer || ''; });
    }
    // MOCK: דמיית חשיבה עם השהיה קצרה
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(self._mockRespond(userText)); }, 650 + Math.random() * 500);
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

  /* ---------- סגנונות (פעם אחת) ---------- */
  function injectStyles() {
    if (document.getElementById('ai-styles')) return;
    var css = ''
      + '.ai-widget{position:fixed;bottom:20px;left:20px;z-index:9998;font-family:var(--font-body,system-ui)}'
      + '.ai-launcher{display:flex;align-items:center;gap:8px;background:var(--navy,#0c2542);color:#fff;border:0;border-radius:99px;padding:12px 20px;font-family:inherit;font-weight:700;font-size:.92rem;cursor:pointer;box-shadow:0 10px 30px rgba(12,37,66,.30);transition:transform .15s}'
      + '.ai-launcher:hover{transform:translateY(-2px)}'
      + '.ai-launcher-ico{font-size:1.1rem}'
      + '.ai-panel{position:absolute;bottom:64px;left:0;width:min(380px,calc(100vw - 40px));height:min(560px,calc(100vh - 120px));background:var(--surface,#fff);border:1px solid var(--line,rgba(12,37,66,.12));border-radius:20px;box-shadow:0 24px 60px rgba(12,37,66,.28);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(16px) scale(.97);pointer-events:none;transition:all .25s cubic-bezier(.2,.8,.2,1)}'
      + '.ai-panel.open{opacity:1;transform:none;pointer-events:auto}'
      + '.ai-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--navy,#0c2542);color:#fff}'
      + '.ai-head-info{display:flex;align-items:center;gap:10px}'
      + '.ai-avatar{width:38px;height:38px;border-radius:50%;background:var(--grad-blue,linear-gradient(160deg,#0992c2,#5b99c3));display:flex;align-items:center;justify-content:center;font-size:1.1rem}'
      + '.ai-head-title{font-weight:800;font-size:.95rem}'
      + '.ai-head-sub{font-size:.74rem;opacity:.8;margin-top:1px}'
      + '.ai-close{background:rgba(255,255,255,.15);border:0;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:.85rem}'
      + '.ai-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#f5f8fc)}'
      + '.ai-msg{display:flex}'
      + '.ai-msg.user{justify-content:flex-start}'    /* RTL: user right side visually via row-reverse below */
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

  window.SRAssistant = SRAssistant;
})();
