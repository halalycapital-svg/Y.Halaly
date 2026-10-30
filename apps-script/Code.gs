/**
 * Lead magnet delivery for halalycapital-svg.github.io/Y.Halaly
 * Receives name + email from the site forms, saves the lead to this sheet,
 * and emails the matching free PDF as an attachment.
 * Bound to a Google Sheet (Extensions > Apps Script). Deploy as Web app:
 * Execute as: Me, Who has access: Anyone.
 */
const SITE = 'https://halalycapital-svg.github.io/Y.Halaly/';
const COMMUNITY_URL = ''; // WhatsApp community invite link, optional

const PRODUCTS = {
  yoman: {
    subject: 'התבנית שלך מחכה פה 📓',
    file: 'free/yoman-template.pdf',
    fileName: 'תבנית יומן המסחר - יניר הללי.pdf',
    intro: 'הנה תבנית יומן המסחר שלי, בדיוק זו שאני ממלא אחרי כל סשן. היא מצורפת למייל הזה כ-PDF.',
    tip: 'טיפ אחד לפני שאתה מתחיל: תמלא את שלב 01 (מטרה) לפני שאתה פותח את הפלטפורמה. לא אחרי.'
  },
  guide: {
    subject: 'המדריך שלך: 5 הסיבות שאתה לא עקבי',
    file: 'free/5-reasons-guide.pdf',
    fileName: '5 הסיבות שאתה לא עקבי - יניר הללי.pdf',
    intro: 'הנה המדריך המלא כ-PDF, מצורף למייל הזה. כולל דף התוכנית בעמוד אחד בסוף.',
    tip: 'אל תקרא את כולו הערב. תבחר סיבה אחת, תעשה את התרגיל שלה מחר בסשן, ותראה מה קורה.'
  }
};

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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('לידים') || ss.insertSheet('לידים');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['תאריך', 'שם', 'מייל', 'מוצר', 'אישר דיוור', 'עמוד']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), name, email, p.product, p.consent ? 'כן' : 'לא', p.src || '']);
  } finally {
    lock.releaseLock();
  }

  const pdf = UrlFetchApp.fetch(SITE + product.file).getBlob().setName(product.fileName);
  MailApp.sendEmail({
    to: email,
    subject: product.subject,
    name: 'יניר הללי',
    htmlBody: body_(name, product),
    attachments: [pdf]
  });
  return ContentService.createTextOutput('ok');
}

function body_(name, product) {
  const hi = name ? 'היי ' + name + ',' : 'היי,';
  const community = COMMUNITY_URL
    ? '<p style="margin:0 0 16px">ועוד דבר: יש לי קהילת וואטסאפ של סוחרי 9-5. בלי ספאם, רק אני. <a href="' + COMMUNITY_URL + '" style="color:#C62828;font-weight:700">להצטרפות לקהילה</a></p>'
    : '';
  return '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#111317;max-width:560px">'
    + '<p style="margin:0 0 16px;font-size:18px;font-weight:700">' + hi + '</p>'
    + '<p style="margin:0 0 16px">' + product.intro + '</p>'
    + '<p style="margin:0 0 16px;background:#FFF4F4;border-right:4px solid #C62828;padding:12px 14px">' + product.tip + '</p>'
    + '<p style="margin:0 0 8px">ואם אתה כבר יודע מה לעשות, ופשוט לא עושה את זה כשהכסף על השולחן, בשביל זה בניתי את "התוכנית": דף אחד, שלך, שאומר לך מה לעשות עוד לפני שהשוק נפתח.</p>'
    + '<p style="margin:0 0 20px"><a href="' + SITE + 'tochnit.html?utm_source=email&utm_medium=leadmagnet" style="display:inline-block;background:#C62828;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">לפרטים על התוכנית</a></p>'
    + community
    + '<p style="margin:0">בהצלחה מחר בסשן,<br><b>יניר הללי</b><br><span style="color:#6A6F7A;font-size:13px">@y.halaly · התוכן לצורכי לימוד בלבד ואינו ייעוץ השקעות. לא רוצה עוד מיילים? תענה למייל הזה "הסר".</span></p>'
    + '</div>';
}
