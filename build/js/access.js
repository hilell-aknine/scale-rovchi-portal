/**
 * access.js — שכבת גישה/זהות לפורטל סקייל רווחי
 *
 * ⚠️ גישה זמנית בצד-לקוח לשלד בלבד.
 * הגישה הסופית תהיה צד-שרת: Supabase Auth + RLS, לא דגל localStorage.
 * דגל localStorage ניתן לזיוף — אין להסתמך עליו בייצור.
 *
 * מפתח: הלל אקנין | פרויקט: סקייל רווחי | Tier 1
 */

(function () {
  'use strict';

  const EMAIL_KEY = 'sr_user_email';

  /**
   * requireAccess()
   * נקרא בראש כל עמוד מוגן.
   * אם אין מייל ב-localStorage — מפנה ל-index.html.
   */
  function requireAccess() {
    const email = localStorage.getItem(EMAIL_KEY);
    if (!email || email.trim() === '') {
      window.location.href = 'index.html';
    }
  }

  /**
   * getViewer()
   * מחזיר את המייל השמור (viewer_id במערכת).
   * @returns {string|null}
   */
  function getViewer() {
    return localStorage.getItem(EMAIL_KEY) || null;
  }

  /**
   * logout()
   * מנקה את localStorage ומפנה ל-index.html.
   */
  function logout() {
    localStorage.removeItem(EMAIL_KEY);
    // ניקוי שדות נוספים שייתכן שנשמרו בסשן
    localStorage.removeItem('scale_revachi_portal_access');
    window.location.href = 'index.html';
  }

  // חשיפה גלובלית
  window.access = {
    requireAccess,
    getViewer,
    logout,
  };
})();
