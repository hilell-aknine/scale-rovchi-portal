/**
 * content.js — שכבת טעינת התוכן של פורטל סקייל רווחי
 * טוען נתוני שיעורים ומחשף API גלובלי דרך window.SRContent
 */

(function () {
  'use strict';

  // כמה חבילות תוכן (lesson-NN.json) לנסות לטעון. חבילות חסרות מדולגות בחן.
  const LESSON_COUNT = 16;

  // פונקציה שמנסה לטעון JSON מ-URL, מחזירה null בכישלון
  async function safeFetch(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // מפתח לאחסון השיעורים המאוחדים
  let _lessons = [];
  // הגדרת הקורסים (קיבוץ השיעורים) — נטען מ-real-lessons.json
  let _courses = [];

  // בסיס נתיב — נגזר ממיקום content.js עצמו, כדי שגם דפים בתת-תיקיות (features/game) יטענו נכון
  const BASE = (function () {
    const s = document.currentScript || document.querySelector('script[src*="content.js"]');
    if (s && s.src) return s.src.replace(/[?#].*$/, '').replace(/js\/content\.js$/, '');
    return './';
  })();

  // Promise מרכזי — מתממש כשכל הנתונים נטענו
  const ready = (async function loadAll() {
    // שלב 1: טען את רשימת השיעורים הראשית (מקור-אמת לרשימה ולקישורי וידאו)
    const realRaw = await safeFetch(BASE + 'data/real-lessons.json');
    // תומך גם במערך עירום וגם באובייקט { lessons: [...] }
    const realLessons = Array.isArray(realRaw)
      ? realRaw
      : (realRaw && Array.isArray(realRaw.lessons) ? realRaw.lessons : null);
    if (!realLessons) {
      // אם real-lessons.json חסר/לא תקין — מערך ריק, לא קורסים
      _lessons = [];
      if (typeof console !== 'undefined') console.warn('[SRContent] real-lessons.json לא נטען או לא במבנה צפוי — אין שיעורים');
      return;
    }

    // שמור את הגדרת הקורסים (קיבוץ) אם קיימת
    _courses = (realRaw && Array.isArray(realRaw.courses)) ? realRaw.courses : [];

    // שלב 2: בנה מפה בסיסית מ-real-lessons.json
    const baseMap = {};
    for (const item of realLessons) {
      baseMap[item.order] = {
        order: item.order,
        title: item.title || '',
        vimeo_id: item.vimeo_id || '',
        embed_url: item.embed_url || '',
        course: item.course || null,
        duration_minutes: (item.duration_minutes ?? null),
        pending_video: !!item.pending_video,
        description: '',
        key_points: [],
        practice_questions: []
      };
    }

    // שלב 3: טען חבילות תוכן לכל שיעור ומזג (כישלון = דלג בחן)
    const packagePromises = [];
    for (let i = 1; i <= LESSON_COUNT; i++) {
      const padded = String(i).padStart(2, '0');
      packagePromises.push(safeFetch(`${BASE}data/lessons/lesson-${padded}.json`));
    }
    const packages = await Promise.all(packagePromises);

    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      if (!pkg) continue; // קובץ חסר — דלג
      const order = pkg.order ?? (i + 1);
      if (!baseMap[order]) continue; // order לא קיים ברשימה — דלג
      baseMap[order].description = pkg.description || '';
      baseMap[order].key_points = Array.isArray(pkg.key_points) ? pkg.key_points : [];
      baseMap[order].practice_questions = Array.isArray(pkg.practice_questions) ? pkg.practice_questions : [];
    }

    // שלב 4: גזירת דגלים — האם יש לשיעור חוברת (נקודות מפתח) ומשחק (שאלות תרגול)
    for (const order in baseMap) {
      const l = baseMap[order];
      l.has_workbook = Array.isArray(l.key_points) && l.key_points.length > 0;
      l.has_questions = Array.isArray(l.practice_questions) && l.practice_questions.length > 0;
    }

    // שלב 5: מיין לפי order ושמור
    _lessons = Object.values(baseMap).sort((a, b) => a.order - b.order);
  })();

  // חשיפת ה-API הגלובלי
  window.SRContent = {
    /** Promise שמתממש כשכל הנתונים נטענו */
    ready,

    /** מערך מאוחד של כל השיעורים, ממוין לפי order */
    getLessons() {
      return _lessons;
    },

    /** הגדרת הקורסים (קיבוץ): [{ id, title, orders:[...] }] */
    getCourses() {
      return _courses;
    },

    /** שיעור בודד לפי order (מספר), או null אם לא נמצא */
    getLesson(order) {
      return _lessons.find(l => l.order === order) ?? null;
    },

    /** מערך practice_questions לשיעור, או [] אם אין */
    getQuestions(order) {
      const lesson = this.getLesson(order);
      return lesson ? lesson.practice_questions : [];
    }
  };
})();
