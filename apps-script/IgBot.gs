/**
 * IG comment bot (replaces ManyChat, free).
 * Every 5 minutes: reads the latest posts of @y.halaly, finds new comments with a keyword,
 * sends the commenter a private DM (Instagram "private reply"), answers publicly, and logs it.
 *
 * One-time setup (Apps Script editor, same project as Code.gs):
 * 1. Project Settings -> Script Properties -> add IG_TOKEN = <long-lived Instagram token>
 * 2. Run setupIgBot() once (creates the 5-minute and weekly triggers).
 * Token: Meta app with "Instagram API with Instagram Login", permissions
 *   instagram_business_basic, instagram_business_manage_comments, instagram_business_manage_messages.
 */
const IG_API = 'https://graph.instagram.com/v21.0';
const IG_SELF = 'y.halaly';
const IG_LOG_SHEET = 'בוט אינסטגרם';
const IG_MAX_AGE_DAYS = 6;      // private replies are allowed up to 7 days after the comment
const IG_POSTS_TO_SCAN = 8;
const FEEDBACK_PAGE = 'https://docs.google.com/document/d/1aDjrUAdf611QzBdhlSTeNkfbWYJuHzod9rg4l4fD2b0/export?format=pdf';

const IG_PUBLIC_REPLIES = ['שלחתי לך בפרטי 🙌🏽', 'בדרך אליך, תבדוק את ההודעות 📩', 'נשלח! ספר לי מה גילית 👇'];

const IG_RULES = [
  { name: 'yaad', match: /יעד/, dm: function () {
      const now = Date.now();
      const liveEnd = LIVE_AT.getTime() + 30 * 60 * 1000;
      let extra;
      if (now < liveEnd) {
        extra = 'ועוד משהו: ' + liveDay_() + ' ב-18:45 אני עולה לייב בגוגל מיט, חצי שעה.\n'
          + 'בונים יחד את חלון המסחר שלך, בחינם.\n'
          + 'להרשמה: ' + SITE + 'live.html?utm_source=instagram&utm_medium=bot';
      } else if (now < LAUNCH_END.getTime()) {
        extra = 'ואם אתה רוצה לבנות את כל החוקים שלך על דף אחד:\n'
          + '"הפרוטוקול", 497 ₪ במקום 797 ₪, רק עד 9.11.\n'
          + SITE + 'tochnit.html?utm_source=instagram&utm_medium=bot';
      } else {
        extra = 'ועוד משהו: בקהילת סוחרי 9-5 בוואטסאפ אני משתף תוכן כל שבוע, בחינם:\n' + COMMUNITY_URL;
      }
      return 'היי 🙌🏽\nראיתי שהגבת "יעד", הנה דף המישוב היומי שלי 👇\n' + FEEDBACK_PAGE + '\n\n'
        + 'ממלאים 5 דקות אחרי שסוגרים את המסך.\nודבר אחד חשוב: לא כותבים את הרווח. בכוונה.\n\n' + extra;
    } },
  { name: 'protocol', match: /פרוטוקול|תוכנית/, dm: function () {
      const live = Date.now() < LAUNCH_END.getTime();
      return 'היי 🎯\nשמח שאתה פה.\n\n'
        + 'אם הגעת עד לכאן, כנראה שאתה מכיר את זה:\nיודע הכל, ועדיין מסיים חלק מהימים במינוס שלא תכננת.\n\n'
        + '"הפרוטוקול" בונה לך דף אחד, שלך:\nמתי סוחרים, מתי לא, כמה מותר להפסיד, ומה עושים ביום שהכל הולך הפוך.\n'
        + '6 שיעורים קצרים, שיעור ביום.\n\n'
        + (live ? '497 ₪ במקום 797 ₪, רק עד 9.11, ו-10 הראשונים מקבלים גם סדנה חיה איתי.\n' : '')
        + 'כל הפרטים כאן 👇\n' + SITE + 'tochnit.html?utm_source=instagram&utm_medium=bot\n\n'
        + 'שאלות? פשוט תכתוב לי כאן, אני עונה אישית.';
    } }
];

function liveDay_() {
  const d = Utilities.formatDate(LIVE_AT, 'Asia/Jerusalem', 'yyyy-MM-dd');
  const today = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const tomorrow = Utilities.formatDate(new Date(Date.now() + DAY), 'Asia/Jerusalem', 'yyyy-MM-dd');
  if (d === today) return 'היום';
  if (d === tomorrow) return 'מחר';
  return 'ביום שני ' + Utilities.formatDate(LIVE_AT, 'Asia/Jerusalem', 'd.M');
}

function igToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('IG_TOKEN');
  if (!t) throw new Error('IG_TOKEN is missing in Script Properties');
  return t;
}

function igGet_(path, params) {
  const q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  const res = UrlFetchApp.fetch(IG_API + path + '?' + q + (q ? '&' : '') + 'access_token=' + igToken_(), { muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 300) throw new Error('GET ' + path + ' ' + res.getResponseCode() + ' ' + res.getContentText());
  return body;
}

function igPost_(path, payload) {
  const res = UrlFetchApp.fetch(IG_API + path + '?access_token=' + igToken_(), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), body: res.getContentText() };
}

function igLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(IG_LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(IG_LOG_SHEET);
    sh.appendRow(['תאריך', 'משתמש', 'תגובה', 'מילת קוד', 'פוסט', 'הודעה פרטית', 'תגובה ציבורית', 'comment_id']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Runs every 5 minutes. */
function igScanComments() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const done = JSON.parse(props.getProperty('IG_DONE') || '{}');
    const since = Number(props.getProperty('IG_SINCE') || 0);
    const cutoff = Math.max(since, Date.now() - IG_MAX_AGE_DAYS * DAY);
    const sh = igLogSheet_();
    const media = (igGet_('/me/media', { fields: 'id,permalink,timestamp', limit: IG_POSTS_TO_SCAN }).data) || [];
    let i = 0;
    media.forEach(function (m) {
      const comments = (igGet_('/' + m.id + '/comments', { fields: 'id,text,username,timestamp,from', limit: 50 }).data) || [];
      comments.forEach(function (c) {
        if (done[c.id] || !c.text || c.username === IG_SELF) return;
        if (new Date(c.timestamp).getTime() < cutoff) return;
        const rule = IG_RULES.filter(function (r) { return r.match.test(c.text); })[0];
        if (!rule) return;
        done[c.id] = Date.now();
        const dm = igPost_('/me/messages', { recipient: { comment_id: c.id }, message: { text: rule.dm() } });
        const pub = igPost_('/' + c.id + '/replies', { message: IG_PUBLIC_REPLIES[(i++) % IG_PUBLIC_REPLIES.length] });
        sh.appendRow([new Date(), c.username, c.text, rule.name, m.permalink,
          dm.code < 300 ? 'נשלח' : 'שגיאה ' + dm.code + ': ' + dm.body.slice(0, 200),
          pub.code < 300 ? 'נשלח' : 'שגיאה ' + pub.code, c.id]);
      });
    });
    // keep only recent ids so the property stays small
    Object.keys(done).forEach(function (k) { if (done[k] < Date.now() - 8 * DAY) delete done[k]; });
    props.setProperty('IG_DONE', JSON.stringify(done));
  } finally {
    lock.releaseLock();
  }
}

/** Weekly: long-lived Instagram tokens last 60 days; refreshing keeps them alive. */
function igRefreshToken() {
  const res = UrlFetchApp.fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' + igToken_(), { muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText() || '{}');
  if (body.access_token) PropertiesService.getScriptProperties().setProperty('IG_TOKEN', body.access_token);
}

/**
 * Run once. Only comments written after this moment are answered by the bot
 * (older ones were handled by hand), unless you pass a date.
 */
function setupIgBot() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['igScanComments', 'igRefreshToken'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().setProperty('IG_SINCE', String(Date.now()));
  ScriptApp.newTrigger('igScanComments').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('igRefreshToken').timeBased().everyWeeks(1).create();
  igLogSheet_();
  igGet_('/me', { fields: 'id,username' }); // fails fast if the token is wrong
}
