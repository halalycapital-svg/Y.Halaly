/**
 * Lead magnets + follow-up emails for halalycapital-svg.github.io/Y.Halaly
 * - doPost: saves the lead to its own sheet (one sheet per lead magnet) and emails the PDF.
 * - sendFollowUps: runs every hour (time trigger) and sends emails 2-4 to leads who opted in.
 * Bound to the Google Sheet "לידים מהאתר - יניר הללי". Web app: Execute as Me, access Anyone.
 * After pasting a new version: run setup() once from the editor (creates the hourly trigger).
 */
const SITE = 'https://halalycapital-svg.github.io/Y.Halaly/';
const COMMUNITY_URL = 'https://chat.whatsapp.com/LicoXEnhp2g5dKtpWNDUs1';
const LAUNCH_END = new Date('2026-11-09T23:59:59+02:00');
const DAY = 24 * 60 * 60 * 1000;
const FOLLOW_UP_DAYS = [1, 2, 4, 6]; // days after signup for each follow-up email
const HEADERS = ['תאריך', 'שם', 'מייל', 'אישר דיוור', 'עמוד', 'מייל 2', 'מייל 3', 'מייל 4', 'מייל 5', 'הוסר (לסמן x)'];
const SENT_COL = 5;                       // zero-based index of 'מייל 2'
const REMOVED_COL = HEADERS.length - 1;    // zero-based index of 'הוסר'

const PRODUCTS = {
  yoman: {
    sheet: 'לידים - יומן',
    label: 'תבנית יומן המסחר',
    subject: 'התבנית שלך מחכה פה 📓',
    file: 'free/yoman-template.pdf',
    fileName: 'תבנית יומן המסחר - יניר הללי.pdf',
    intro: 'הנה תבנית יומן המסחר שלי, בדיוק זו שאני ממלא אחרי כל סשן. היא מצורפת למייל הזה כ-PDF.',
    tip: 'טיפ אחד לפני שאתה מתחיל: תמלא את שלב 01 (מטרה) לפני שאתה פותח את הפלטפורמה. לא אחרי.',
    opener: 'לפני יומיים הורדת ממני את תבנית היומן.'
  },
  guide: {
    sheet: 'לידים - מדריך',
    label: 'המדריך 5 הסיבות',
    subject: 'המדריך שלך: 5 הסיבות שאתה לא עקבי',
    file: 'free/5-reasons-guide.pdf',
    fileName: '5 הסיבות שאתה לא עקבי - יניר הללי.pdf',
    intro: 'הנה המדריך המלא כ-PDF, מצורף למייל הזה. 5 הסיבות, ותרגיל אחד לכל סיבה.',
    tip: 'אל תקרא את כולו הערב. תבחר סיבה אחת, תעשה את התרגיל שלה מחר בסשן, ותראה מה קורה.',
    opener: 'לפני יומיים הורדת ממני את המדריך על 5 הסיבות שאתה לא עקבי.'
  },
  plan: {
    sheet: 'לידים - דף התוכנית',
    label: 'דף התוכנית בעמוד אחד',
    subject: 'דף התוכנית שלך (בחינם עד 9.11) 🎯',
    file: 'free/plan-template.pdf',
    fileName: 'תוכנית המסחר בעמוד אחד - יניר הללי.pdf',
    intro: 'הנה תוכנית המסחר בעמוד אחד, מצורפת למייל הזה. עמוד 1 ממלאים, עמוד 2 מסביר איך ממלאים נכון. היא עולה 89 ₪, ועד ההשקה ב-9.11 היא אצלך בחינם.',
    tip: 'תמלא אותה הערב, לא בבוקר לפני הסשן. כללים כותבים בראש קר.',
    opener: 'לפני יומיים קיבלת ממני את תוכנית המסחר בעמוד אחד.'
  }
};

/* ---------- 1. New lead ---------- */
function doPost(e) {
  const p = (e && e.parameter) || {};
  const product = PRODUCTS[p.product];
  const email = String(p.email || '').trim();
  const name = String(p.name || '').trim().slice(0, 60);
  if (p.website || !product || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return ContentService.createTextOutput('ignored');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = [new Date(), name, email, p.consent ? 'כן' : 'לא', p.src || ''];
    while (row.length < HEADERS.length) row.push('');
    sheet_(product).appendRow(row);
  } finally {
    lock.releaseLock();
  }
  const pdf = UrlFetchApp.fetch(SITE + product.file).getBlob().setName(product.fileName);
  MailApp.sendEmail({ to: email, subject: product.subject, name: 'יניר הללי',
    htmlBody: welcome_(name, product), attachments: [pdf] });
  return ContentService.createTextOutput('ok');
}

function sheet_(product) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(product.sheet);
  if (!sh) {
    sh = ss.insertSheet(product.sheet);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  if (sh.getRange(1, 1, 1, HEADERS.length).getValues()[0].join('|') !== HEADERS.join('|')) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  }
  return sh;
}

/* ---------- 2. Follow-ups (hourly) ---------- */
function sendFollowUps() {
  const now = Date.now();
  Object.keys(PRODUCTS).forEach(function (key) {
    const product = PRODUCTS[key];
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(product.sheet);
    if (!sh || sh.getLastRow() < 2) return;
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
    rows.forEach(function (r, i) {
      const joined = new Date(r[0]).getTime(), name = r[1], email = r[2];
      if (r[3] !== 'כן' || String(r[REMOVED_COL]).trim() || !email || !joined) return;
      for (let n = 0; n < FOLLOW_UPS.length; n++) {
        if (r[SENT_COL + n]) continue;                  // already sent
        if (n > 0 && !r[SENT_COL + n - 1]) break;       // previous one not sent yet
        if (now - joined < FOLLOW_UP_DAYS[n] * DAY) break;
        const mail = FOLLOW_UPS[n](name, product);
        MailApp.sendEmail({ to: email, subject: mail.subject, name: 'יניר הללי', htmlBody: wrap_(mail.html) });
        sh.getRange(i + 2, SENT_COL + n + 1).setValue(new Date());
        break;                                          // one email per lead per run
      }
    });
  });
}

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendFollowUps') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendFollowUps').timeBased().everyHours(1).create();
  Object.keys(PRODUCTS).forEach(function (k) { sheet_(PRODUCTS[k]); });
}

/* ---------- 3. Copy (short-line storytelling style) ---------- */
function launchLive_() { return Date.now() < LAUNCH_END.getTime(); }
function link_(tag) { return SITE + 'tochnit.html?utm_source=email&utm_medium=followup&utm_campaign=' + tag; }
function clubLink_(tag) { return SITE + 'yhalaly_moadon_sales.html?utm_source=email&utm_medium=followup&utm_campaign=' + tag; }
// One block of short lines. Each argument is a line; '' makes a breathing gap.
function L_() {
  return '<p style="margin:0 0 18px">' + Array.prototype.slice.call(arguments).join('<br>') + '</p>';
}
function b_(t) { return '<b>' + t + '</b>'; }
function a_(text, href) { return '<a href="' + href + '" style="color:#C62828;font-weight:700;text-decoration:underline">' + text + '</a>'; }
function hi_(name) { return L_(name ? 'היי ' + name + ',' : 'היי,'); }
function sign_() { return L_('שלך מהעמדה,', b_('יניר.')); }

function offers_(tag) {
  const live = launchLive_();
  return '<div style="margin:26px 0 0;border-top:1px solid #E4E4E4;padding-top:18px">'
    + L_('ברגע שאתה מרגיש מוכן…', 'ככה אני יכול לעבוד איתך:')
    + L_(b_('1) "התוכנית"'), 'בונים יחד את תוכנית המסחר שלך,', 'דף אחד שמחליט בשבילך', 'עוד לפני שהשוק נפתח.',
         live ? '497 ₪ במקום 797 ₪, רק עד 9.11.' : '797 ₪, תשלום אחד.', a_('מכאן נכנסים <<<', link_(tag)))
    + L_(b_('2) שבוע בחדר המסחר'), 'יושב לידי מול המסך בזמן אמת.', '197 ₪, ומי שנשאר במועדון', 'מקבל את זה בחזרה.', a_('מכאן מצטרפים לשבוע <<<', clubLink_(tag)))
    + L_(b_('3) קהילת סוחרי 9-5'), 'בחינם, בוואטסאפ. בלי ספאם, רק אני.', a_('מכאן מצטרפים <<<', COMMUNITY_URL))
    + '</div>';
}

function wrap_(inner) {
  return '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:17px;line-height:1.75;color:#111317;max-width:520px">'
    + inner
    + '<p style="margin:26px 0 0;color:#6A6F7A;font-size:12px;line-height:1.6">@y.halaly · יניר הללי · התוכן לצורכי לימוד בלבד ואינו ייעוץ השקעות.<br>לא רוצה עוד מיילים? תענה "הסר" ואני מוריד אותך.</p>'
    + '</div>';
}

function tagOf_(product) {
  return product.sheet === PRODUCTS.yoman.sheet ? 'yoman' : product.sheet === PRODUCTS.guide.sheet ? 'guide' : 'plan';
}

function welcome_(name, product) {
  const tag = tagOf_(product);
  return wrap_(hi_(name)
    + L_(product.intro)
    + L_(b_('דבר אחד לפני שאתה פותח אותו:'), product.tip)
    + L_('תבין,', '', 'הקובץ הזה לא יעשה כלום', 'אם הוא יישב בהורדות.', '', 'תדפיס אותו.', 'תשים אותו ליד המסך.', 'ותמלא אותו בסשן הבא.')
    + L_('בימים הקרובים אני שולח לך', '3 מיילים קצרים.', 'בכל אחד, כלי אחד', 'שעבד עליי מול המסך.', '', 'לא עוד תיאוריה.', 'דברים שאפשר ליישם מחר.')
    + sign_()
    + L_('נ.ב.', '', 'יש לי קהילת וואטסאפ של סוחרי 9-5.', 'שם אני משתף את מה שלא נכנס למיילים.', '', a_('מכאן מצטרפים <<<', COMMUNITY_URL))
    + offers_('welcome-' + tag));
}

const FOLLOW_UPS = [
  // Email 2: day 1. The one question at the end of every session.
  function (name, product) {
    return {
      subject: 'כן או לא',
      html: hi_(name)
        + L_('אתמול בערב, אחרי הסשן,', 'עמדתי מול החלון.', '', 'מולי איילון.', 'אותו כביש שבשוליים שלו', 'עצרתי פעם את הג\'יפ…', '', 'בלי אוויר.', 'עם חשבון ריק.')
        + L_('ושאלתי את עצמי שאלה אחת.', '', 'לא "כמה הרווחתי".', 'לא "כמה הפסדתי".')
        + L_(b_('"עשיתי את מה שתכננתי?"'), '', 'כן או לא.')
        + L_('בצבא קוראים לזה תחקיר.', '', 'אחרי כל משימה,', 'לא שואלים אם ניצחנו.', 'שואלים אם ביצענו את התוכנית.', '', 'כי ניצחון בלי תוכנית?', 'זה מזל.', 'והמזל נגמר.')
        + L_('ובמסחר זה בדיוק אותו דבר…', '', 'יום שבו שברת את כל הכללים', 'ויצאת ברווח…', '', 'נרשם במוח כהצלחה.', '', 'ויום שבו עבדת מושלם', 'והשוק פשוט לא נתן…', '', 'נרשם ככישלון.')
        + L_('ככה מאמנים את המוח', 'בדיוק הפוך.')
        + L_(b_('אז הנה התרגיל שלך לשבוע:'), '', 'אחרי כל סשן,', 'עוד לפני שאתה מסתכל על הרווח וההפסד,', 'תכתוב מילה אחת.', '', 'כן.', 'או לא.', '', 'בסוף השבוע תספור.')
        + L_('רוב הסוחרים מגלים', 'שהם עומדים בתוכנית שלהם', 'פחות מחצי מהימים.', '', 'וימי ה"לא"?', 'אלה בדיוק הימים', 'שמחקו את השבוע.')
        + sign_()
        + L_('נ.ב.', '', 'ואם קראת את זה וחשבת', '"רגע… מה בעצם התוכנית שלי?"', '', 'זה הכי נפוץ.', 'ובשביל זה בדיוק בניתי את "התוכנית".', '', a_('מכאן בונים את שלך <<<', link_('email2')))
        + offers_('email2')
    };
  },
  // Email 3: day 2. Traders 9-5 are always left behind. 18:45, short, one task.
  function (name, product) {
    return {
      subject: '18:45',
      html: hi_(name)
        + L_('10:00 בבוקר.', '', 'אתה באמצע יום עבודה,', 'והטלפון מקפיץ התראה:', '', b_('"הלייב מתחיל עכשיו!"'))
        + L_('עוד וובינר.', 'עוד זום.', 'עוד שידור חי…', '', 'כולם בבוקר.', 'כולם בשעות שאתה בעבודה.')
        + L_('ואתה?', '', 'בישיבה.', 'מול לקוח.', 'בדרך.')
        + L_('מבטיח לעצמך שתראה את ההקלטה בערב.', '', 'ובערב?', 'מקלחות. אוכל. הילדים.', 'ההקלטה נשארת פתוחה בטאב', 'עד שהיא נסגרת לבד.')
        + L_(b_('סוחרי 9-5 תמיד נשארים מאחור.'))
        + L_('אני יודע.', '', 'כי גם אני עובד במשרה רגילה.')
        + L_('אז אצלי זה הפוך:', '', b_('18:45.'), 'חצי שעה.', 'קצר, מדויק, ממוקד.', '', 'בלי חפירות.', 'בלי למרוח.', 'בלי מילים מיותרות.')
        + L_('וכל מפגש נגמר במשימה אחת', 'שאתה עושה כבר באותו רגע.', '', 'ב-19:15 אתה בבית.', 'עם הראש בבית.')
        + L_('ועוד משהו שאף אחד לא מספר לך…', '', 'הבורסה בארה"ב נפתחת ב-16:30', 'שעון ישראל.', '', 'סוחר 9-5 שסוחר ES', 'לא "מנסה בערבים".', b_('הוא סוחר בשעות הכי טובות של השוק.'))
        + L_(b_('המשימה שלך, עכשיו, 2 דקות:'), '', 'תכתוב את חלון המסחר שלך.', 'לא מתי שהשוק פתוח.', 'מתי שאתה באמת פנוי, עם ראש נקי.', '', 'מ-____ עד ____.', '', 'מחוץ לחלון הזה?', 'לא פותחים את הפלטפורמה.')
        + sign_()
        + L_('נ.ב.', '', 'רוצה לראות איך זה נראה?', 'שבוע אחד בחדר המסחר,', 'כולל הזום של 18:45.', '', '197 ₪, ואם אתה נשאר במועדון', 'אתה מקבל את זה בחזרה.', '', a_('מכאן מצטרפים לשבוע <<<', clubLink_('email-1845')))
        + offers_('email-1845')
    };
  },
  // Email 4: day 4. The ATM story + 3 numbers to write tonight.
  function (name, product) {
    return {
      subject: '10 שקלים מתחת לכיסא',
      html: hi_(name)
        + L_('יום עבודה.', 'חם רצח בחוץ.', '', 'בא לי קולה.', 'מעביר אשראי…', '', 'לא עובר.')
        + L_('הולך לכספומט.', '', 'הכרטיס נבלע.')
        + L_('לוקח מים במקום,', 'חצי מהמחיר של הקולה.', '', 'גם לא עובר.')
        + L_('אז אני יורד לרכב', 'ומתחיל לאסוף עודף', 'מתחת לכיסאות…', '', '10 שקלים.', '', '10 שקלים שהפכו להיות', 'כל העולם שלי.')
        + L_('ואתה יודע מה הכי מצחיק?', '', 'באותה תקופה הייתי בטוח', 'שחסר לי עוד אינדיקטור.', 'עוד אסטרטגיה.', 'עוד קורס.')
        + L_('לא חסר לי ידע.', '', b_('חסרו לי 3 מספרים על דף.'))
        + L_(b_('1) גבול הפסד יומי בשקלים.'), 'נגעת בו? סוגרים את הפלטפורמה.', 'לא "עוד אחת אחרונה".')
        + L_(b_('2) כמות קבועה לעסקה.'), 'לא גדלה אחרי הפסד.', 'אף פעם.')
        + L_(b_('3) מה אתה עושה אחרי 2 הפסדים ברצף.'), 'אצלי? 15 דקות רחוק מהמסך.')
        + L_('זהו.', '', 'שלושה מספרים.', 'נכתבים בראש קר.', 'ונדבקים על המסך.')
        + L_('כי ברגע של לחץ', 'אתה לא תזכור אותם.', '', 'אתה צריך לראות אותם.')
        + L_(b_('התרגיל שלך:'), 'תכתוב אותם הערב.', 'לא מחר בבוקר.', 'הערב.')
        + L_('תבין,', '', 'השוק לא מתגמל על הקליק.', '', b_('הוא מתגמל על מה שקורה לפניו.'))
        + sign_()
        + L_('נ.ב.', '', 'לקח לי שנה לחזור לרווחיות.', 'ועוד כמה שנים עד שהמסחר', 'מימן לי את רוב המחיה.', '', 'את הדרך הזאת אפשר לקצר.', 'ב"התוכנית" כותבים את 3 המספרים האלה,', 'ועוד 8 כאלה, יחד איתי.', '', a_('מכאן נכנסים <<<', link_('email3')))
        + offers_('email3')
    };
  },
  // Email 4: day 5. The color check before every session + deadline.
  function (name, product) {
    const live = launchLive_();
    return {
      subject: live ? 'אדום (ועוד משהו שנגמר ב-9.11)' : 'אדום',
      html: hi_(name)
        + L_('טייס לא ממריא', 'בלי צ\'קליסט.', '', 'גם אם הוא טס', 'כבר 20 שנה.', '', 'גם אם מזג האוויר מושלם.', 'גם אם הוא ממהר.')
        + L_('ואנחנו?', '', 'פותחים את הפלטפורמה', 'אחרי לילה של 4 שעות שינה,', 'ריב בבית,', 'ויום עמוס בעבודה…', '', 'ומתפלאים שהסשן ברח.')
        + L_('אז לפני כל כניסה לעמדה', 'אני שואל שאלה אחת:', '', b_('באיזה צבע אני היום?'))
        + L_('🟢 ' + b_('ירוק.'), 'ישנתי, הראש פנוי, יש דוח הכנה.', 'סוחר לפי התוכנית.')
        + L_('🟡 ' + b_('צהוב.'), 'משהו לא יושב.', 'חצי כמות, חצי עסקאות,', 'רק הסטאפ הכי חזק.')
        + L_('🔴 ' + b_('אדום.'), 'לא פותח את הפלטפורמה.', '', 'נקודה.')
        + L_('והטריק?', '', 'להחליט מראש', 'מה הופך יום לאדום.', '', 'שינה גרועה.', 'ריב בבית.', 'הפסד גדול אתמול.', '', 'אלה לא תירוצים.', b_('אלה נתונים.'))
        + L_('ככה אתה לא מתווכח עם עצמך', 'בזמן אמת.')
        + L_('אף אחד לא מצלם', 'את הימים שבהם לא סחרת.', '', 'אבל הם אלה', 'ששומרים לך על החשבון.')
        + sign_()
        + (live
          ? L_('נ.ב.', '', b_('ב-9.11 נסגר מחיר ההשקה של "התוכנית".'), '', '497 ₪ במקום 797 ₪.', 'ו-10 הראשונים מקבלים גם', 'סדנה חיה איתי,', 'שבה בונים את התוכנית בלייב.', '', 'אחרי 9.11?', 'המחיר עולה, והסדנה לא חוזרת.', '', a_('מכאן נכנסים במחיר השקה <<<', link_('email4')))
          : L_('נ.ב.', '', 'את הצבע של היום,', 'ועוד 10 כללים כאלה,', 'כותבים ב"התוכנית".', '', a_('מכאן נכנסים <<<', link_('email4'))))
        + L_('ואם יש לך שאלה לפני?', 'פשוט תענה למייל הזה.', 'אני קורא כל תשובה.')
        + offers_('email4')
    };
  }
];
