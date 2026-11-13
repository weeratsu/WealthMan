/**
 * WealthMan Sheet API (Nov 11 2026) — Google Apps Script Web App for the WealthMan Google Sheet.
 * Tabs (row 1 = header, key column first):
 *   Trades     key = txn_id            (source = pdf | manual, deleted = soft delete)
 *   Dividends  key = div_id (security|pay_date)
 *   Securities key = security          (price, price_date, price_unit, class, type)
 *   FX         key = fx_id (date|ccy)
 *   Settings   key = key               (json = value as JSON text)
 *
 * Setup: Extensions > Apps Script > paste this file > Run setup() once (creates tabs + token)
 *        > Deploy > New deployment > Web app (Execute as: Me, Access: Anyone) > copy URL.
 * Token: Project Settings > Script properties > TOKEN (setup() creates a random one; read it from the log).
 *
 * Requests: POST body (text/plain) JSON {token, action, ...}
 *   {action:'get'}                                  -> {ok, data:{Trades:[...],Dividends:[...],...}}
 *   {action:'upsert', tab:'Trades', rows:[{...}]}    -> insert or update by key, {ok, inserted, updated}
 *   {action:'replace', tab:'Securities', rows:[...]} -> overwrite whole tab
 */
var TABS = {
  // v3: key = trade_key (txn_id|order_no) — txn_id is per slip, one slip can contain several orders
  Trades: ['trade_key','txn_id','asset_class','asset_manager','doc_no','issue_date','iso_date','effective_date','fx_thb_usd','order_no',
           'settlement','type','security','exchange','units','price','ccy','gross_usd','fee_usd','total_usd','gross_thb',
           'fee_thb','total_thb','source_file','source','note','deleted','updated_at'],
  Dividends: ['div_id','security','pay_date','record_date','per_share','gross_usd','wht_usd','fee_usd','net_usd','ccy',
              'note','source','deleted','updated_at'],
  Securities: ['security','price','price_date','price_unit','class','type','note','updated_at'],
  FX: ['fx_id','date','ccy','rate','source','updated_at'],
  Settings: ['key','json','updated_at'],
  History: ['ts','tab','key','old_json','new_updated_at']   // v2: every overwritten Settings value is kept here
};

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var h = TABS[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('TOKEN')) p.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('TOKEN = ' + p.getProperty('TOKEN'));
}

function doGet() { return out_({ ok: true, app: 'WealthMan Sheet API' }); }

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (x) { return out_({ ok: false, error: 'bad json' }); }
  if (req.token !== PropertiesService.getScriptProperties().getProperty('TOKEN')) return out_({ ok: false, error: 'unauthorized' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (req.action === 'get') return out_({ ok: true, data: readAll_() });
    if (req.action === 'upsert') return out_(upsert_(req.tab, req.rows || []));
    if (req.action === 'replace') return out_(replace_(req.tab, req.rows || []));
    return out_({ ok: false, error: 'unknown action' });
  } catch (x) {
    return out_({ ok: false, error: String(x) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

function sheet_(tab) {
  if (!TABS[tab]) throw new Error('unknown tab ' + tab);
  var sh = SpreadsheetApp.getActive().getSheetByName(tab);
  if (!sh) { setup(); sh = SpreadsheetApp.getActive().getSheetByName(tab); }
  return sh;
}

function header_(sh, tab) {
  var last = Math.max(sh.getLastColumn(), 1);
  var h = sh.getRange(1, 1, 1, last).getValues()[0].filter(String);
  // add any new columns defined in TABS (never removes/reorders existing ones)
  TABS[tab].forEach(function (c) { if (h.indexOf(c) < 0) { h.push(c); sh.getRange(1, h.length).setValue(c).setFontWeight('bold'); } });
  return h;
}

function readTab_(tab) {
  var sh = sheet_(tab), h = header_(sh, tab), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, h.length).getValues().map(function (r) {
    var o = {}; h.forEach(function (c, i) { o[c] = r[i] instanceof Date ? iso_(r[i]) : r[i]; }); return o;
  });
}

function readAll_() { var d = {}; Object.keys(TABS).forEach(function (t) { d[t] = readTab_(t); }); return d; }

function upsert_(tab, rows) {
  var sh = sheet_(tab), h = header_(sh, tab), key = h[0], n = sh.getLastRow() - 1;
  var keys = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var idx = {}; keys.forEach(function (k, i) { idx[k] = i; });
  var now = new Date().toISOString(), ins = [], upd = 0;
  var hist = (tab === 'Settings') ? [] : null, jcol = h.indexOf('json');
  rows.forEach(function (o) {
    var k = String(o[key] == null ? '' : o[key]); if (!k) return;
    o.updated_at = o.updated_at || now;
    var vals = h.map(function (c) { return val_(o[c]); });
    if (idx[k] != null) {
      var rg = sh.getRange(idx[k] + 2, 1, 1, h.length);
      if (hist && jcol >= 0) { var oldv = rg.getValues()[0][jcol]; if (String(oldv) !== String(vals[jcol])) hist.push([now, tab, k, oldv, o.updated_at]); }
      rg.setValues([vals]); upd++;
    }
    else { ins.push(vals); idx[k] = keys.length + ins.length - 1; }
  });
  if (ins.length) sh.getRange(sh.getLastRow() + 1, 1, ins.length, h.length).setValues(ins);
  if (hist && hist.length) { var hs = sheet_('History'); hs.getRange(hs.getLastRow() + 1, 1, hist.length, 5).setValues(hist); }
  return { ok: true, inserted: ins.length, updated: upd };
}

function replace_(tab, rows) {
  if (tab === 'Settings' || tab === 'History') throw new Error('replace not allowed on ' + tab + ' (data safety)');
  var sh = sheet_(tab), h = header_(sh, tab), now = new Date().toISOString();
  if (!rows.length) throw new Error('refusing to replace ' + tab + ' with 0 rows');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  var vals = rows.map(function (o) { o.updated_at = o.updated_at || now; return h.map(function (c) { return val_(o[c]); }); });
  if (vals.length) sh.getRange(2, 1, vals.length, h.length).setValues(vals);
  return { ok: true, rows: vals.length };
}

function val_(v) { return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : v); }
function iso_(d) { return Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd'); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
