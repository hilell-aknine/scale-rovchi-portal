/*!
 * credit.js — חותמת הקרדיט של הלל אקנין (מקור-אמת יחיד)
 * ----------------------------------------------------------------------------
 * מטרה: פוטר דיסקרטי, יוקרתי, RTL — "נבנה ע"י הלל אקנין" — שלחיצה עליו פותחת
 *        וואטסאפ עם הודעה ממולאת מראש שכוללת מאיפה הפונה הגיע (שיווק זעיר).
 *
 * שימוש — אירוח (הפרויקטים של הלל):
 *   <script src="https://<host>/credit.js"
 *           data-credit-project="הפורטל של סקייל רווחי"></script>
 *
 * שימוש — עותק מוטמע (פרויקטי לקוח למסירה, בלי תלות חיצונית):
 *   מדביקים את כל הקובץ בתוך <script>...</script> בתחתית הדף, ומגדירים:
 *   window.HILLEL_CREDIT_PROJECT = "מערכת השמירה של ג'ף";  // לפני הטעינה
 *
 * הגדרות נוספות (אופציונלי, דרך data-* על תגית ה-script):
 *   data-credit-project   — שם הפרויקט שיופיע בהודעת הוואטסאפ (חובה בפועל)
 *   data-credit-phone     — מספר יעד; ברירת מחדל 972549116092
 *   data-credit-variant   — "default" (ברירת מחדל) | "client" (דיסקרטי במיוחד)
 *
 * ⛔ כלל קשיח: החותמת שייכת ל-UI/מסכים בלבד. לעולם לא בתוך וידאו/ריילים.
 */
(function () {
  'use strict';

  if (window.__hillelCreditMounted) return; // הזרקה כפולה — לא
  window.__hillelCreditMounted = true;

  // ---- קריאת הגדרות -------------------------------------------------------
  var script = document.currentScript ||
    (function () {
      var s = document.getElementsByTagName('script');
      return s[s.length - 1];
    })();
  var d = (script && script.dataset) || {};

  var PHONE = (d.creditPhone || window.HILLEL_CREDIT_PHONE || '972549116092')
    .replace(/[^0-9]/g, '');

  // שם הפרויקט: data-attr -> global -> כותרת הדף -> דומיין
  var PROJECT =
    d.creditProject ||
    window.HILLEL_CREDIT_PROJECT ||
    (document.title && document.title.trim()) ||
    location.hostname ||
    'אחת המערכות';

  var VARIANT = d.creditVariant || window.HILLEL_CREDIT_VARIANT || 'default';

  // ---- בניית קישור הוואטסאפ עם ייחוס מקור --------------------------------
  var msg = 'היי הלל, הגעתי מ' + PROJECT + ' שבנית. אשמח לפרטים על מערכת כזו בשבילי.';
  var href = 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg);

  // ---- עיצוב: קצר, יוקרתי, ניטרלי-ערכה, RTL ------------------------------
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var css =
    '#hillel-credit{direction:rtl;font-family:"Heebo","Assistant",system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'text-align:center;padding:18px 16px;width:100%;box-sizing:border-box;line-height:1.6}' +
    '#hillel-credit a{display:inline-flex;align-items:center;gap:7px;' +
    'font-size:12.5px;letter-spacing:.04em;font-weight:500;text-decoration:none;' +
    'color:currentColor;opacity:.45;' +
    (reduceMotion ? '' : 'transition:opacity .25s ease,transform .25s ease;') +
    'border-radius:999px;padding:6px 4px}' +
    '#hillel-credit a:hover,#hillel-credit a:focus-visible{opacity:.9;outline:none}' +
    (reduceMotion ? '' : '#hillel-credit a:hover{transform:translateY(-1px)}') +
    '#hillel-credit .hc-dot{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.6;flex:0 0 auto}' +
    '#hillel-credit .hc-name{font-weight:600;letter-spacing:.02em}' +
    '#hillel-credit svg{width:13px;height:13px;flex:0 0 auto;opacity:.85}' +
    (VARIANT === 'client'
      ? '#hillel-credit a{opacity:.3;font-size:11.5px}#hillel-credit a:hover{opacity:.75}'
      : '');

  var style = document.createElement('style');
  style.id = 'hillel-credit-style';
  style.textContent = css;
  document.head.appendChild(style);

  // ---- אלמנט החותמת -------------------------------------------------------
  var footer = document.createElement('footer');
  footer.id = 'hillel-credit';
  footer.setAttribute('role', 'contentinfo');

  var a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'נבנה על ידי הלל אקנין — לפנייה בוואטסאפ');

  // אייקון וואטסאפ זעיר (inline SVG)
  a.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' +
    '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.97L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.21 8.21 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/>' +
    '</svg>' +
    '<span class="hc-name">נבנה ע״י הלל אקנין</span>';

  footer.appendChild(a);

  function mount() {
    document.body.appendChild(footer);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
