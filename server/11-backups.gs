/* =====================================================================
 * Backups
 * - setupBackups(): run ONCE from the Apps Script editor (choose it in the toolbar, press Run, allow the permissions).
 *   It turns on autoBackup() every 4 hours and makes the first backup.
 * - Each backup is a full copy of the spreadsheet (items, photos, bills, settings) in the Drive folder "Rate Book backups".
 *   A copy is skipped when the sheet hasn't changed since the last one.
 * - Kept: every copy from the last 2 days, then the newest copy of each day for 30 days, then the newest of each month
 *   for 12 months. Older copies go to Drive's Trash (recoverable there for 30 days).
 * - Restore (from the app, PIN): backs up the current sheet first, makes a fresh copy of the chosen backup and switches
 *   the app to it. Nothing is deleted, so a restore can always be undone by restoring the "before restore" copy.
 * - Optional weekly Excel copy by email (set in the app), ideally to someone else's address, in case the Google account itself is lost.
 * ===================================================================== */
const BACKUP_FOLDER = 'Rate Book backups';
const BACKUP_PREFIX = 'Rate Book backup ';
const BK_TZ = 'Asia/Kolkata';

function setupBackups() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'autoBackup').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('autoBackup').timeBased().everyHours(4).create();
  const b = backupNow_('first');
  Logger.log('Automatic backups are on (every 4 hours). First backup: ' + b.name);
}

/** Runs every 4 hours. */
function autoBackup() {
  const props = PropertiesService.getScriptProperties();
  const changed = DriveApp.getFileById(ss_().getId()).getLastUpdated().getTime();
  const last = Number(props.getProperty('BK_SRC_TIME') || 0);
  if (changed > last) backupNow_('auto');
  try { weeklyMail_(); } catch (err) { props.setProperty('BK_MAIL_ERR', String(err && err.message || err)); }
}

function backupFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BK_FOLDER');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {} }
  const b = boot_(); if (b && b.bkFolder) { const f = DriveApp.getFolderById(b.bkFolder); props.setProperty('BK_FOLDER', f.getId()); return f; }   // never another shop's folder by name
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  props.setProperty('BK_FOLDER', f.getId());
  return f;
}

function backupNow_(why) {
  const props = PropertiesService.getScriptProperties();
  const src = DriveApp.getFileById(ss_().getId());
  const now = new Date();
  const label = why === 'before-restore' ? ' (before restore)' : why === 'before-archive' ? ' (before archive)' : why === 'manual' ? ' (manual)' : '';
  const name = BACKUP_PREFIX + Utilities.formatDate(now, BK_TZ, 'yyyy-MM-dd HH:mm') + label;
  const copy = src.makeCopy(name, backupFolder_());
  props.setProperty('BK_LAST', now.toISOString());
  props.setProperty('BK_SRC_TIME', String(src.getLastUpdated().getTime()));
  try { pruneBackups_(); } catch (err) { softErr_('backup:prune', err); }
  return { id: copy.getId(), name: name, date: now.toISOString() };
}

/** Which backups to keep: all from the last 2 days, newest per day for 30 days, newest per month for 12 months. Manual and before-restore copies count like any other. */
function pruneBackups_() {
  const files = backupFiles_();
  const now = Date.now(), day = 864e5, keep = {}, perDay = {}, perMonth = {};
  files.forEach(f => {
    const age = now - f.t, d = Utilities.formatDate(new Date(f.t), BK_TZ, 'yyyy-MM-dd');
    if (age <= 2 * day) { keep[f.id] = 1; return; }
    if (age <= 30 * day) { if (!perDay[d]) { perDay[d] = 1; keep[f.id] = 1; } return; }
    if (age <= 366 * day) { const m = d.slice(0, 7); if (!perMonth[m]) { perMonth[m] = 1; keep[f.id] = 1; } }
  });
  let trashed = 0;
  files.forEach(f => { if (!keep[f.id]) { try { f.file.setTrashed(true); trashed++; } catch (err) { softErr_('backup:trash', err); } } });
  return trashed;
}

/** Backup files, newest first. */
function backupFiles_() {
  const out = [];
  const it = backupFolder_().getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    if (name.indexOf(BACKUP_PREFIX) !== 0 || f.isTrashed()) continue;
    out.push({ id: f.getId(), name: name, t: f.getDateCreated().getTime(), file: f });
  }
  out.sort((a, b) => b.t - a.t);
  return out;
}

function backupInfo_() {
  const props = PropertiesService.getScriptProperties();
  const auto = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'autoBackup');
  let list = [];
  try { list = backupFiles_().slice(0, 40).map(f => ({ id: f.id, name: f.name, date: new Date(f.t).toISOString(), url: 'https://docs.google.com/spreadsheets/d/' + f.id })); } catch (err) {}
  return { backups: { auto: auto, last: props.getProperty('BK_LAST') || '', count: list.length, list: list,
    email: props.getProperty('BK_EMAIL') || '', lastMail: props.getProperty('BK_MAIL_LAST') || '', mailError: props.getProperty('BK_MAIL_ERR') || '',
    restoredAt: props.getProperty('BK_RESTORED_AT') || '', restoredFrom: props.getProperty('BK_RESTORED_FROM') || '',
    current: 'https://docs.google.com/spreadsheets/d/' + ss_().getId() } };
}

function restoreBackup_(id, by) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const files = backupFiles_();
    const f = files.filter(x => x.id === id)[0];
    if (!f) throw new Error('backup_not_found');
    backupNow_('before-restore');
    const fresh = f.file.makeCopy('Rate Book prices (restored from ' + f.name.slice(BACKUP_PREFIX.length) + ')');
    const props = PropertiesService.getScriptProperties();
    props.setProperty('SHEET_ID', fresh.getId());
    cPut_('SHEET_ID', fresh.getId()); cfgCacheDrop_();   // (v67) a failed put mustn't leave the old sheet's id cached
    /* (v67) the restored copy may have more or fewer archived years: the list follows its tabs, and the yearly run may go again */
    try { const names = fresh.getId && SpreadsheetApp.openById(fresh.getId()).getSheets().map(x => x.getName()); ['live', 'test'].forEach(en => props.setProperty('ARC_' + en, JSON.stringify((names || []).map(nm => { const m = nm.match(/^(Test )?Bills (\d{4}-\d{2})$/); return m && !!m[1] === (en === 'test') ? m[2] : null; }).filter(Boolean).sort()))); props.deleteProperty('ARC_DONE'); } catch (e) { softErr_('restore:archive', e); }
    try { editTrigger_(); } catch (e) { CacheService.getScriptCache().remove('TRIG_OK'); }   // hand edits are watched on the restored copy
    props.setProperty('BK_RESTORED_AT', new Date().toISOString());
    props.setProperty('BK_RESTORED_FROM', 'the backup of ' + f.name.slice(BACKUP_PREFIX.length) + (by ? ' · by ' + by : ''));
    props.setProperty('BK_SRC_TIME', String(fresh.getLastUpdated().getTime()));
    for (const k in HEADERS_OK_) delete HEADERS_OK_[k];
    bump_();
    return { restored: { from: f.name, url: 'https://docs.google.com/spreadsheets/d/' + fresh.getId() } };
  } finally { lock.releaseLock(); }
}

function setBackupEmail_(email) {
  email = email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('bad_email');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('BK_EMAIL', email);
  if (email) props.deleteProperty('BK_MAIL_LAST');      // send the first one with the next backup run
  props.deleteProperty('BK_MAIL_ERR');
  return backupInfo_();
}

/** Once a week: email an Excel copy of the whole sheet to the backup address (if one is set). */
function weeklyMail_(force) {
  const props = PropertiesService.getScriptProperties();
  const to = props.getProperty('BK_EMAIL');
  if (!to) return false;
  const last = Number(new Date(props.getProperty('BK_MAIL_LAST') || 0).getTime()) || 0;
  if (!force && Date.now() - last < 7 * 864e5 - 3600e3) return false;
  const id = ss_().getId();
  const blob = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }).getBlob();
  const stamp = Utilities.formatDate(new Date(), BK_TZ, 'dd MMM yyyy');
  blob.setName('Rate Book backup ' + Utilities.formatDate(new Date(), BK_TZ, 'yyyy-MM-dd') + '.xlsx');
  const body = 'Weekly backup of the Rate Book sheet (' + stamp + '), attached as an Excel file.\n\nKeep this email. If the Google sheet is ever lost, this file has every item, bill and setting up to today.';
  if (blob.getBytes().length < 20 * 1024 * 1024) MailApp.sendEmail(to, 'Rate Book weekly backup · ' + stamp, body, { attachments: [blob] });
  else MailApp.sendEmail(to, 'Rate Book weekly backup · ' + stamp, 'The backup is too large to attach this week. Latest copies are in the "Rate Book backups" folder in Google Drive.');
  props.setProperty('BK_MAIL_LAST', new Date().toISOString());
  props.deleteProperty('BK_MAIL_ERR');
  return true;
}


