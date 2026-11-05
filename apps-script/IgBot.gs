/**
 * IG comment bot (replaces ManyChat, free).
 * Every 5 minutes: reads the latest posts of @y.halaly, finds new comments with a keyword,
 * sends the commenter a private DM (Instagram "private reply"), answers publicly, and logs it.
 *
 * One-time setup (Apps Script editor, same project as Code.gs):
 * 1. Project Settings -> Script Properties -> add IG_TOKEN = <Page access token, never expires>
 * 2. Run setupIgBot() once (creates the 5-minute trigger).
 * Token: Meta app "Yanir Trading Assistant" (Facebook Login), Page token of "יניר הללי Yanir Halaly"
 *   with instagram_basic, instagram_manage_comments, instagram_manage_messages, pages_show_list.
 */
const IG_API = 'https://graph.facebook.com/v21.0';
const IG_USER_ID = '17841401304113168';   // @y.halaly
const IG_PAGE_ID = '104984852444798';     // FB page linked to @y.halaly
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
  { name: 'desk', match: /עמדה/, dm: function () {
      return 'היי 🙌🏽\nהכנתי לך מתנה: 5 הדברים לעשות בעמדה כשאתה בעסקה 🎁\nכדי לקבל אותה, השאר שם ומייל כאן, והיא נשלחת אליך:\n'
        + SITE + 'free/desk-gate.html?utm_source=instagram&utm_medium=bot\n\n'
        + 'אחרי שתנסה, כתוב לי כאן מה עזר לך הכי הרבה. אני עונה אישית.\n\n'
        + 'ובקהילת סוחרי 9-5 בוואטסאפ אני משתף תוכן כל שבוע, בחינם:\n' + COMMUNITY_URL;
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


/* ---------- one handler for IG and FB, top-level comments AND replies ----------
   Rule: one bot answer per person per thread (root comment). */
function botHandle_(c, user, isSelf, rootId, link, platform, sh, done, publicIdx) {
  const text = c.text || c.message || '';
  if (!text || isSelf || done[c.id]) return publicIdx;
  const tTime = new Date(c.timestamp || c.created_time).getTime();
  const since = Number(PropertiesService.getScriptProperties().getProperty('IG_SINCE') || 0);
  if (tTime < Math.max(since, Date.now() - IG_MAX_AGE_DAYS * DAY)) return publicIdx;
  const rule = IG_RULES.filter(function (r) { return r.match.test(text); })[0];
  if (!rule) return publicIdx;
  const threadKey = 'u:' + user + ':' + rootId;
  if (done[threadKey]) return publicIdx; // already answered this person in this thread
  done[c.id] = Date.now();
  done[threadKey] = Date.now();
  const pageId = platform === 'FB' ? IG_PAGE_ID : IG_PAGE_ID;
  const dm = igPost_('/' + pageId + '/messages', { recipient: { comment_id: c.id }, message: { text: rule.dm() } });
  const pubPath = platform === 'FB' ? '/' + c.id + '/comments' : '/' + c.id + '/replies';
  const pub = igPost_(pubPath, { message: IG_PUBLIC_REPLIES[publicIdx % IG_PUBLIC_REPLIES.length] });
  sh.appendRow([new Date(), user, text, rule.name, (platform === 'FB' ? 'FB ' : '') + link,
    dm.code < 300 ? 'נשלח' : 'שגיאה ' + dm.code + ': ' + dm.body.slice(0, 200),
    pub.code < 300 ? 'נשלח' : 'שגיאה ' + pub.code, c.id]);
  return publicIdx + 1;
}

function scanPlatform_(platform, posts, sh, done) {
  const fields = platform === 'FB' ? 'id,message,from,created_time' : 'id,text,username,timestamp';
  const repFields = platform === 'FB' ? 'id,message,from,created_time' : 'id,text,username,timestamp';
  let idx = Object.keys(done).length;
  posts.forEach(function (p) {
    const link = p.permalink || p.permalink_url || p.id;
    let roots = [];
    try { roots = (igGet_('/' + p.id + '/comments', { fields: fields, limit: 50 }).data) || []; } catch (err) { return; }
    roots.forEach(function (c) {
      const user = platform === 'FB' ? ((c.from && c.from.name) || '') : c.username;
      const isSelf = platform === 'FB' ? (c.from && c.from.id === IG_PAGE_ID) : user === IG_SELF;
      const norm = { id: c.id, text: c.text || c.message, timestamp: c.timestamp, created_time: c.created_time };
      idx = botHandle_(norm, user, isSelf, c.id, link, platform, sh, done, idx);
      // replies under this comment (ריפליי)
      let reps = [];
      try { reps = (igGet_('/' + c.id + '/replies', { fields: repFields, limit: 50 }).data) || []; } catch (err) { reps = []; }
      reps.forEach(function (r) {
        const ru = platform === 'FB' ? ((r.from && r.from.name) || '') : r.username;
        const rSelf = platform === 'FB' ? (r.from && r.from.id === IG_PAGE_ID) : ru === IG_SELF;
        const rn = { id: r.id, text: r.text || r.message, timestamp: r.timestamp, created_time: r.created_time };
        idx = botHandle_(rn, ru, rSelf, c.id, link, platform, sh, done, idx);
      });
    });
  });
}

/** Runs every 5 minutes. */
function igScanComments() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const done = JSON.parse(props.getProperty('IG_DONE') || '{}');
    const sh = igLogSheet_();
    const media = (igGet_('/' + IG_USER_ID + '/media', { fields: 'id,permalink,timestamp', limit: IG_POSTS_TO_SCAN }).data) || [];
    scanPlatform_('IG', media, sh, done);
    Object.keys(done).forEach(function (k) { if (done[k] < Date.now() - 8 * DAY) delete done[k]; });
    props.setProperty('IG_DONE', JSON.stringify(done));
    let fbPosts = [];
    try { fbPosts = (igGet_('/' + IG_PAGE_ID + '/posts', { fields: 'id,permalink_url', limit: IG_POSTS_TO_SCAN }).data) || []; } catch (err) { fbPosts = []; }
    const fbDone = JSON.parse(props.getProperty('FB_DONE') || '{}');
    scanPlatform_('FB', fbPosts, sh, fbDone);
    Object.keys(fbDone).forEach(function (k) { if (fbDone[k] < Date.now() - 8 * DAY) delete fbDone[k]; });
    props.setProperty('FB_DONE', JSON.stringify(fbDone));
  } finally {
    lock.releaseLock();
  }
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
  igLogSheet_();
  igGet_('/' + IG_USER_ID, { fields: 'id,username' }); // fails fast if the token is wrong
}
