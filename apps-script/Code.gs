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
const FOLLOW_UP_DAYS = [1, 3, 5]; // email 2, 3, 4 after signup
const HEADERS = ['תאריך', 'שם', 'מייל', 'אישר דיוור', 'עמוד', 'מייל 2', 'מייל 3', 'מייל 4', 'הוסר (לסמן x)'];

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
    sheet_(product).appendRow([new Date(), name, email, p.consent ? 'כן' : 'לא', p.src || '', '', '', '', '']);
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
      if (r[3] !== 'כן' || String(r[8]).trim() || !email || !joined) return;
      for (let n = 0; n < 3; n++) {
        if (r[5 + n]) continue;                         // already sent
        if (n > 0 && !r[4 + n]) break;                  // previous one not sent yet
        if (now - joined < FOLLOW_UP_DAYS[n] * DAY) break;
        const mail = FOLLOW_UPS[n](name, product);
        MailApp.sendEmail({ to: email, subject: mail.subject, name: 'יניר הללי', htmlBody: wrap_(mail.html) });
        sh.getRange(i + 2, 6 + n).setValue(new Date());
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

/* ---------- 3. Copy ---------- */
function launchLive_() { return Date.now() < LAUNCH_END.getTime(); }
function price_() { return launchLive_() ? '497 ₪ (במקום 797 ₪, עד 9.11)' : '797 ₪'; }
function link_(tag) { return SITE + 'tochnit.html?utm_source=email&utm_medium=followup&utm_campaign=' + tag; }
function btn_(text, href) {
  return '<p style="margin:22px 0"><a href="' + href + '" style="display:inline-block;background:#C62828;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">' + text + '</a></p>';
}
function box_(html) {
  return '<div style="margin:0 0 16px;background:#FFF4F4;border-right:4px solid #C62828;padding:12px 14px">' + html + '</div>';
}
function dark_(html) {
  return '<div style="margin:0 0 16px;background:#111317;color:#ffffff;border-radius:12px;padding:16px 18px">' + html + '</div>';
}
function p_(t) { return '<p style="margin:0 0 14px">' + t + '</p>'; }
function hi_(name) { return '<p style="margin:0 0 16px;font-size:18px;font-weight:700">' + (name ? 'היי ' + name + ',' : 'היי,') + '</p>'; }

function wrap_(inner) {
  return '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#111317;max-width:560px">'
    + inner
    + '<p style="margin:20px 0 0">בהצלחה בסשן הבא,<br><b>יניר הללי</b><br><span style="color:#6A6F7A;font-size:13px">@y.halaly · התוכן לצורכי לימוד בלבד ואינו ייעוץ השקעות. לא רוצה עוד מיילים? תענה למייל הזה "הסר".</span></p>'
    + '</div>';
}

function welcome_(name, product) {
  const community = '<p style="margin:0 0 16px">ועוד דבר: יש לי קהילת וואטסאפ של סוחרי 9-5. בלי ספאם, רק אני. <a href="' + COMMUNITY_URL + '" style="color:#C62828;font-weight:700">להצטרפות לקהילה</a></p>';
  return wrap_(hi_(name) + p_(product.intro) + box_(product.tip)
    + p_('ואם אתה כבר יודע מה לעשות, ופשוט לא עושה את זה כשהכסף על השולחן, בשביל זה בניתי את "התוכנית": דף אחד, שלך, שאומר לך מה לעשות עוד לפני שהשוק נפתח.')
    + btn_('לפרטים על התוכנית', link_('welcome-' + (product.sheet === PRODUCTS.yoman.sheet ? 'yoman' : product.sheet === PRODUCTS.guide.sheet ? 'guide' : 'plan')))
    + community);
}

const FOLLOW_UPS = [
  // Email 2: day 1. Value: the one question at the end of the session.
  function (name, product) {
    return {
      subject: 'השאלה היחידה שאני שואל בסוף כל סשן',
      html: hi_(name) + p_(product.opener + ' אז הנה הדבר הכי פשוט שיש לי לתת לך, וגם הכי חזק.')
        + p_('רוב הסוחרים מסיימים סשן ושואלים: כמה הרווחתי? כמה הפסדתי?')
        + p_('זו שאלה שמלמדת אותך בדיוק את הדבר הלא נכון. יום שבו שברת את כל הכללים ויצאת ברווח, נרשם במוח כהצלחה. ויום שבו עבדת מושלם והשוק פשוט לא נתן, נרשם ככישלון.')
        + dark_('<p style="margin:0 0 6px;color:#D7D9DE">אז אני שואל שאלה אחרת. אחת. כל יום:</p><p style="margin:0;font-size:20px;font-weight:700">עשיתי את מה שתכננתי? <span style="color:#FF6B6B">כן או לא.</span></p>')
        + p_('<b>התרגיל שלך לשבוע הקרוב:</b> אחרי כל סשן, לפני שאתה מסתכל על הרווח וההפסד, תכתוב כן או לא. רק זה. בסוף השבוע תספור כמה "כן" היו לך.')
        + p_('רוב הסוחרים מגלים שהם עומדים בתוכנית שלהם פחות מחצי מהימים. ושימי ה"לא" הם בדיוק הימים שמחקו את השבוע.')
        + p_('ואם בכלל לא ברור לך מה "התוכנית" שלך, שזה הכי נפוץ, זה בדיוק מה שאנחנו בונים יחד ב"התוכנית". ' + price_() + '.')
        + btn_('לבנות את התוכנית שלי', link_('email2'))
    };
  },
  // Email 3: day 3. Story + 3 day limits to set tonight.
  function (name, product) {
    return {
      subject: '10 שקלים מתחת לכיסא ברכב',
      html: hi_(name) + p_('הייתי בטוח שמספיק 100 דולר ביום. 100 כפול 20 ימי מסחר, יותר מהמשכורת שלי.')
        + p_('אז רדפתי אחריהם. סקאלפ פה, סקאלפ שם. ובימים שה-100 לא הגיע? נשארתי מול המסך עד שהוא יגיע. ואז הפסדתי 300.')
        + dark_('<p style="margin:0;color:#D7D9DE">יום אחד האשראי לא עבר על בקבוק קולה. בכספומט הכרטיס נבלע. מצאתי 10 שקלים בעודף מתחת לכיסאות ברכב, ו-10 השקלים האלה הפכו להיות כל העולם שלי.</p>')
        + p_('מה שהציל אותי לא היה אסטרטגיה חדשה. זה היה 3 מספרים שכתבתי על דף, בראש קר, ולא נגעתי בהם יותר:')
        + box_('<b>1. גבול הפסד יומי בשקלים.</b> נגעת בו? סוגרים את הפלטפורמה. לא "עוד אחת אחרונה".<br><b>2. כמות קבועה לעסקה.</b> לא גדלה אחרי הפסד. אף פעם.<br><b>3. מה עושים אחרי 2 הפסדים ברצף.</b> אצלי: 15 דקות רחוק מהמסך.')
        + p_('<b>התרגיל שלך:</b> תכתוב את 3 המספרים האלה הערב, ותדביק אותם על המסך. ברגע של לחץ לא תזכור אותם. אתה צריך לראות אותם.')
        + p_('השוק לא מתגמל על הקליק. הוא מתגמל על מה שקורה לפניו. וזה בדיוק מה שבונים ב"התוכנית": את הדף שמחליט בשבילך, עוד לפני שהשוק נפתח.')
        + btn_('אני רוצה את הדף שלי', link_('email3'))
    };
  },
  // Email 4: day 5. Color check + deadline.
  function (name, product) {
    const live = launchLive_();
    return {
      subject: live ? 'באיזה צבע אתה היום? (ומחיר ההשקה נגמר ב-9.11)' : 'באיזה צבע אתה היום?',
      html: hi_(name) + p_('הנה הכלי שאני משתמש בו לפני כל כניסה לעמדה. לוקח דקה, ומציל לי ימים שלמים.')
        + p_('שאלה אחת: <b>באיזה צבע אני היום?</b>')
        + box_('🟢 <b>ירוק:</b> ישנתי, הראש פנוי, יש דוח הכנה. סוחר לפי התוכנית.<br>🟡 <b>צהוב:</b> משהו לא יושב. חצי כמות, חצי עסקאות, רק הסטאפ הכי חזק.<br>🔴 <b>אדום:</b> לא פותח את הפלטפורמה. נקודה.')
        + p_('הטריק: להחליט מראש מה הופך יום לאדום. שינה גרועה, ריב בבית, יום עמוס בעבודה, הפסד גדול אתמול. אלה לא תירוצים, אלה נתונים. ככה אתה לא מתווכח עם עצמך בזמן אמת.')
        + p_('אף אחד לא מצלם את הימים שבהם לא סחרת. אבל הם אלה ששומרים לך על החשבון.')
        + (live
          ? dark_('<p style="margin:0 0 6px;font-weight:700">ב-9.11 נסגר מחיר ההשקה של "התוכנית".</p><p style="margin:0;color:#D7D9DE">497 ₪ במקום 797 ₪, ו-10 הראשונים מקבלים גם סדנה חיה איתי, שבה בונים את התוכנית בלייב.</p>')
          : p_('"התוכנית" זמינה עכשיו ב-797 ₪.'))
        + btn_(live ? 'להיכנס במחיר השקה' : 'לפרטים על התוכנית', link_('email4'))
        + p_('ואם יש לך שאלה לפני, פשוט תענה למייל הזה. אני קורא כל תשובה.')
    };
  }
];
