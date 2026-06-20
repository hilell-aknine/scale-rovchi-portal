/* ════════════════════════════════════════════════════════════
   game.js — מנוע משחק התרגול (סגנון דואלינגו)
   ────────────────────────────────────────────────────────────
   פר-שיעור: שאלות, לבבות (חיים), משוב מיידי, פס התקדמות, מסך סיום.
   מתחבר ל-SRGamification (XP + תג "תרגול מושלם") אם קיים בעמוד.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var XP_PER_CORRECT = 5;
  var XP_PERFECT_BONUS = 15;
  var MAX_LIVES = 3;

  function SRGame(opts) {
    this.root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
    this.lessonId = opts.lessonId || 'lsn-1';
    this.lessonTitle = opts.lessonTitle || 'תרגול שיעור';
    this.onFinish = opts.onFinish || function () {};
    // opts.questions = הזרקה ישירה מ-SRContent (השאלות האמיתיות).
    // אין יותר fallback ל-SRQuestions (MOCK) — עדיף ריק (→ "תרגול בהכנה")
    // מאשר להציג שאלות לא-קשורות מהקובץ questions.js.
    this.questions = Array.isArray(opts.questions) ? opts.questions : [];
    this._reset();
  }

  SRGame.prototype._reset = function () {
    this.idx = 0;
    this.lives = MAX_LIVES;
    this.correct = 0;
    this.mistakes = 0;
    this.answered = false;
    this.orderPick = [];   // למצב 'order'
  };

  SRGame.prototype.start = function () {
    this._reset();
    if (!this.questions || this.questions.length === 0) {
      // אין שאלות תקינות — הצג מצב "בהכנה" במקום לקרוס
      this.root.innerHTML =
        '<div class="g-card g-end">' +
          '<div class="g-end-emoji">📝</div>' +
          '<div class="g-end-title">התרגול בהכנה</div>' +
          '<div class="g-end-sub">החומר מתעדכן בקרוב. חזור מאוחר יותר.</div>' +
        '</div>';
      return;
    }
    this._renderQuestion();
  };

  /* ---------- כותרת עליונה: התקדמות + לבבות ---------- */
  SRGame.prototype._renderTopbar = function () {
    var pct = Math.round((this.idx / this.questions.length) * 100);
    var hearts = '';
    for (var i = 0; i < MAX_LIVES; i++) {
      hearts += '<span class="g-heart' + (i < this.lives ? '' : ' lost') + '">' + (i < this.lives ? '❤️' : '🤍') + '</span>';
    }
    return '' +
      '<div class="g-topbar">' +
        '<div class="g-progress"><div class="g-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="g-hearts">' + hearts + '</div>' +
      '</div>' +
      '<div class="g-meta">שאלה ' + (this.idx + 1) + ' מתוך ' + this.questions.length + '</div>';
  };

  /* ---------- רינדור שאלה לפי סוג ---------- */
  SRGame.prototype._renderQuestion = function () {
    this.answered = false;
    this.orderPick = [];
    var qd = this.questions[this.idx];
    var body = '';

    if (qd.type === 'mc') {
      body = '<div class="g-q">' + esc(qd.q) + '</div><div class="g-options">' +
        qd.options.map(function (o, i) {
          return '<button class="g-opt" data-i="' + i + '">' + esc(o) + '</button>';
        }).join('') + '</div>';
    } else if (qd.type === 'tf') {
      body = '<div class="g-q">' + esc(qd.q) + '</div><div class="g-options g-tf">' +
        '<button class="g-opt" data-i="true">✔ נכון</button>' +
        '<button class="g-opt" data-i="false">✘ לא נכון</button>' +
        '</div>';
    } else if (qd.type === 'order') {
      var shuffled = shuffle(qd.items.map(function (t, i) { return { t: t, i: i }; }));
      body = '<div class="g-q">' + esc(qd.q) + '</div>' +
        '<div class="g-order-target" id="g-order-target"><span class="g-order-hint">לחץ על הפריטים לפי הסדר…</span></div>' +
        '<div class="g-order-pool" id="g-order-pool">' +
          shuffled.map(function (it) {
            return '<button class="g-chip" data-i="' + it.i + '">' + esc(it.t) + '</button>';
          }).join('') + '</div>' +
        '<button class="g-check" id="g-check" disabled>בדיקה</button>';
    }

    this.root.innerHTML =
      '<div class="g-card">' +
        this._renderTopbar() +
        '<div class="g-question-area">' + body + '</div>' +
        '<div class="g-feedback" id="g-feedback"></div>' +
      '</div>';

    this._bindQuestion(qd);
  };

  SRGame.prototype._bindQuestion = function (qd) {
    var self = this;
    if (qd.type === 'mc' || qd.type === 'tf') {
      this.root.querySelectorAll('.g-opt').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (self.answered) return;
          var val = btn.dataset.i;
          var isCorrect = (qd.type === 'tf')
            ? (String(qd.answer) === val)
            : (parseInt(val, 10) === qd.answer);
          // סימון ויזואלי
          self.root.querySelectorAll('.g-opt').forEach(function (b) { b.disabled = true; });
          btn.classList.add(isCorrect ? 'correct' : 'wrong');
          if (!isCorrect) {
            // הדגשת הנכונה
            if (qd.type === 'mc') {
              var right = self.root.querySelector('.g-opt[data-i="' + qd.answer + '"]');
              if (right) right.classList.add('correct');
            } else {
              var rb = self.root.querySelector('.g-opt[data-i="' + String(qd.answer) + '"]');
              if (rb) rb.classList.add('correct');
            }
          }
          self._resolve(isCorrect, qd.explain);
        });
      });
    } else if (qd.type === 'order') {
      var pool = this.root.querySelector('#g-order-pool');
      var target = this.root.querySelector('#g-order-target');
      var checkBtn = this.root.querySelector('#g-check');
      pool.addEventListener('click', function (e) {
        var chip = e.target.closest('.g-chip'); if (!chip || self.answered) return;
        chip.remove();
        var hint = target.querySelector('.g-order-hint'); if (hint) hint.remove();
        var placed = chip.cloneNode(true);
        placed.classList.add('placed');
        target.appendChild(placed);
        self.orderPick.push(parseInt(chip.dataset.i, 10));
        // החזרה בלחיצה
        placed.addEventListener('click', function () {
          if (self.answered) return;
          var pos = self.orderPick.indexOf(parseInt(placed.dataset.i, 10));
          if (pos > -1) self.orderPick.splice(pos, 1);
          placed.remove();
          var back = document.createElement('button');
          back.className = 'g-chip'; back.dataset.i = placed.dataset.i; back.textContent = placed.textContent;
          pool.appendChild(back);
          checkBtn.disabled = self.orderPick.length !== qd.items.length;
          if (!target.children.length) target.innerHTML = '<span class="g-order-hint">לחץ על הפריטים לפי הסדר…</span>';
        });
        checkBtn.disabled = self.orderPick.length !== qd.items.length;
      });
      checkBtn.addEventListener('click', function () {
        if (self.answered || self.orderPick.length !== qd.items.length) return;
        // חוזה: qd.items מוזרקים ברצף הנכון, ולכן הסדר הנכון הוא 0,1,2,…
        // (שאלות order_steps שאינן עומדות בחוזה מסוננות במקור — ראה mapQuestion).
        // אם המקור יספק qd.answerOrder (מערך אינדקסים), נכבד אותו.
        var correctOrder = Array.isArray(qd.answerOrder) && qd.answerOrder.length === qd.items.length
          ? qd.answerOrder
          : qd.items.map(function (_, i) { return i; });
        var ok = self.orderPick.length === correctOrder.length &&
                 self.orderPick.every(function (v, i) { return v === correctOrder[i]; });
        target.querySelectorAll('.g-chip').forEach(function (c) { c.classList.add(ok ? 'correct' : 'wrong'); });
        checkBtn.style.display = 'none';
        self._resolve(ok, qd.explain);
      });
    }
  };

  /* ---------- טיפול בתוצאה + משוב ---------- */
  SRGame.prototype._resolve = function (isCorrect, explain) {
    this.answered = true;
    if (isCorrect) {
      this.correct++;
      if (window.SRGamification && window.SRGamification.state) {
        window.SRGamification.addXP(XP_PER_CORRECT, 'תשובה נכונה בתרגול');
      }
    } else {
      this.mistakes++;
      this.lives--;
    }
    // עדכון לבבות בכותרת
    var hearts = this.root.querySelectorAll('.g-heart');
    hearts.forEach(function (h, i) {
      var lost = i >= this.lives;
      h.classList.toggle('lost', lost);
      h.textContent = lost ? '🤍' : '❤️';
    }, this);

    var fb = this.root.querySelector('#g-feedback');
    var last = this.idx === this.questions.length - 1;
    fb.className = 'g-feedback show ' + (isCorrect ? 'ok' : 'no');
    fb.innerHTML =
      '<div class="g-fb-head">' + (isCorrect ? '🎉 נכון!' : '✗ לא מדויק') +
        (isCorrect ? '<span class="g-fb-xp">+' + XP_PER_CORRECT + ' XP</span>' : '') + '</div>' +
      '<div class="g-fb-explain">' + esc(explain || '') + '</div>' +
      '<button class="g-next" id="g-next">' + (last ? 'לסיכום ←' : 'המשך ←') + '</button>';

    var self = this;
    this.root.querySelector('#g-next').addEventListener('click', function () {
      if (self.lives <= 0) { self._renderFail(); return; }
      self.idx++;
      if (self.idx >= self.questions.length) self._renderResults();
      else self._renderQuestion();
    });
  };

  /* ---------- מסך כישלון (נגמרו הלבבות) ---------- */
  SRGame.prototype._renderFail = function () {
    var self = this;
    this.root.innerHTML =
      '<div class="g-card g-end">' +
        '<div class="g-end-emoji">💔</div>' +
        '<div class="g-end-title">נגמרו הלבבות</div>' +
        '<div class="g-end-sub">לא נורא, ככה לומדים. בוא ננסה שוב מההתחלה.</div>' +
        '<button class="g-restart" id="g-restart">התחל מחדש</button>' +
      '</div>';
    this.root.querySelector('#g-restart').addEventListener('click', function () { self.start(); });
  };

  /* ---------- מסך סיום מנצח ---------- */
  SRGame.prototype._renderResults = function () {
    var self = this;
    var perfect = this.mistakes === 0;
    var total = this.questions.length;
    var xpEarned = this.correct * XP_PER_CORRECT + (perfect ? XP_PERFECT_BONUS : 0);

    // אינטגרציה עם הגיימיפיקציה: רישום סיום תרגול + תג מושלם
    if (window.SRGamification && window.SRGamification.state) {
      window.SRGamification.recordActivity('game_complete', { xp: perfect ? XP_PERFECT_BONUS : 0, reason: 'סיום תרגול ' + self.lessonId });
      if (perfect) window.SRGamification.awardBadge('game_perfect');
    }

    this.root.innerHTML =
      '<div class="g-card g-end">' +
        '<div class="g-end-emoji">' + (perfect ? '🌟' : '🎯') + '</div>' +
        '<div class="g-end-title">' + (perfect ? 'תרגול מושלם!' : 'כל הכבוד!') + '</div>' +
        '<div class="g-end-sub">ענית נכון על ' + this.correct + ' מתוך ' + total + ' שאלות.</div>' +
        '<div class="g-end-stats">' +
          '<div class="g-end-stat"><div class="v">' + xpEarned + '</div><div class="l">XP שהרווחת</div></div>' +
          '<div class="g-end-stat"><div class="v">' + Math.round((this.correct / total) * 100) + '%</div><div class="l">דיוק</div></div>' +
          '<div class="g-end-stat"><div class="v">' + (perfect ? '🏆' : (MAX_LIVES - this.mistakes) + '❤️') + '</div><div class="l">' + (perfect ? 'ללא טעויות' : 'לבבות שנותרו') + '</div></div>' +
        '</div>' +
        (perfect ? '<div class="g-end-badge">🌟 פתחת את התג "תרגול מושלם"</div>' : '') +
        '<div class="g-end-actions">' +
          '<button class="g-restart" id="g-again">תרגל שוב</button>' +
          '<button class="g-back" id="g-back">חזרה לשיעור</button>' +
        '</div>' +
      '</div>';

    this.root.querySelector('#g-again').addEventListener('click', function () { self.start(); });
    this.root.querySelector('#g-back').addEventListener('click', function () { self.onFinish({ correct: self.correct, total: total, perfect: perfect, xp: xpEarned }); });
  };

  /* ---------- עזרים ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  window.SRGame = SRGame;
})();
