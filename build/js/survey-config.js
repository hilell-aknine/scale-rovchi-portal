/* ════════════════════════════════════════════════════════════
   survey-config.js — מנוע ההתאמה של המשפך החינמי (סקייל רווחי)
   מקור-אמת: build/data/real-survey-config.json (נשאב מ-Base44, 18.06.2026).
   הציר המרכזי = השאלה השלישית (marketing_concern). היא מניעה את הניתוח
   האישי (analysisContent) ואת השיעור המומלץ (lessonMap).
   ⚠️ שדות PENDING_VERBATIM = לא הומצאו — ממתינים לתוכן מרותם/Base44.
   ════════════════════════════════════════════════════════════ */

/* 5 השאלות הסגורות, מוצגות אחת-אחרי-השנייה */
var QUESTIONS = [
  {
    id: 'uploads_content',
    label: 'האם אתה מעלה תוכן?',
    type: 'boolean',
    options: [
      { value: true,  label: 'כן' },
      { value: false, label: 'לא' }
    ]
  },
  {
    id: 'does_paid_ads',
    label: 'האם אתה עושה ממומן?',
    type: 'boolean',
    options: [
      { value: true,  label: 'כן' },
      { value: false, label: 'לא' }
    ]
  },
  {
    id: 'marketing_concern',
    label: 'מה הדאגה העיקרית שלך בשיווק?',
    type: 'choice',
    options: [
      { value: 'no_leads',                  label: 'אין לי מספיק לידים' },
      { value: 'irrelevant_leads_paid',     label: 'יש לידים לא רלוונטיים (מהממומן)' },
      { value: 'irrelevant_leads_no_paid',  label: 'יש לידים לא רלוונטיים (בלי ממומן)' },
      { value: 'hard_to_sell',              label: 'קשה לי לסגור ולמכור' }
    ]
  },
  {
    id: 'has_team',
    label: 'האם יש לך צוות?',
    type: 'boolean',
    options: [
      { value: true,  label: 'כן' },
      { value: false, label: 'לא' }
    ]
  },
  {
    id: 'income_goal',
    label: 'מה יעד ההכנסה החודשית שלך?',
    type: 'choice',
    options: [
      { value: '30k',   label: '30,000 ₪' },
      { value: '50k',   label: '50,000 ₪' },
      { value: '80k',   label: '80,000 ₪' },
      { value: '100k+', label: '100,000 ₪ ומעלה' }
    ]
  }
];

/* הניתוח האישי — נבחר לפי ערך marketing_concern.
   מקור: real-survey-config.json > analyses.
   body_summary = תמצית בלבד (מה שנשאב). recommendation = PENDING_VERBATIM עד שרותם תספק את הגרסה הסופית. */
var analysisContent = {
  no_leads: {
    title: 'אין לידים = Personal Brand 2026',
    body: 'קשה לגדול בלי לידים. התוכן לא יוצר מספיק חיבור.',
    goal: 'יצירת ביקוש גבוה ונוכחות אישית חזקה.',
    recommendation: 'PENDING_VERBATIM'
  },
  irrelevant_leads_paid: {
    title: 'לידים לא רלוונטיים + ממומן',
    body: 'הבעיה במסר של המודעה שמושכת אנשים לא מדויקים.',
    goal: 'מודעות שמושכות את האנשים המתאימים באמת.',
    recommendation: 'PENDING_VERBATIM'
  },
  irrelevant_leads_no_paid: {
    title: 'לידים לא רלוונטיים + לא ממומן',
    body: 'התוכן לא משדר את הערך המדויק או את סוג הלקוח שאתה מחפש.',
    goal: 'משיכת האנשים הנכונים בצורה אורגנית.',
    recommendation: 'PENDING_VERBATIM'
  },
  hard_to_sell: {
    title: 'קשה במכירות = שיעור הקונפליקט',
    body: 'הבעיה היא בשיווק שלא מנטרל התנגדויות מספיק מוקדם.',
    goal: 'שיווק שמכין את הקרקע למכירה קלה וטבעית.',
    recommendation: 'PENDING_VERBATIM'
  }
};

/* מיפוי הדאגה לשיעור המומלץ — lesson_id אמיתיים מ-Base44.
   video_url = PENDING עד שנשלוף מ-Base44 לפי id.
   ⚠️ no_leads + hard_to_sell — לאמת שקיימים ב-7 שיעורי המשפך שנשלפו. */
var lessonMap = {
  no_leads:                 { lesson_id: '69fb172226f8a8dc7a299c0f', title: 'PERSONAL BRAND ב2026',                               video_url: 'PENDING' },
  irrelevant_leads_paid:    { lesson_id: '69fdb0d061b1d68cdc1682b0', title: 'איך ליצור מודעות ממומנות ל100k',                     video_url: 'PENDING' },
  irrelevant_leads_no_paid: { lesson_id: '6a0ad15fd255b29c89482e43', title: 'פורמטים להנגשת תוכן',                                video_url: 'PENDING' },
  hard_to_sell:             { lesson_id: '69fb172226f8a8dc7a299c0c', title: 'איך לגרום לאנשים לקבל החלטות מהר (קונפליקט)',        video_url: 'PENDING' }
};

/* חשיפה גלובלית */
window.SURVEY = {
  QUESTIONS: QUESTIONS,
  analysisContent: analysisContent,
  lessonMap: lessonMap
};
