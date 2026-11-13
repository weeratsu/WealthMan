/* sheet-sync.js (Nov 11 2026) — WealthMan <-> Google Sheet (WealthMan API).
 * Loaded BEFORE js/app.js. Does not change other modules:
 *  1) Prefix rename: every localStorage key 'dimelog_*' is transparently stored as 'wm_*'
 *     (old values copied once; old keys kept as backup until you delete them).
 *  2) Push: any change to a wm_* key -> (debounced 3s) Settings tab gets the raw JSON of every wm_* key
 *     (complete backup), and the readable tabs are rebuilt: Trades, Dividends, Securities, FX.
 *  3) Pull: on open, Settings rows newer than this browser's copy are written to localStorage, then the
 *     page reloads once so the app starts with the Sheet data (other device's edits).
 * Needs js/config-sheet.js (window.WM_SHEET = {endpoint, token}). Without it, nothing is sent.
 * Manual: wmSheet.push() · wmSheet.pull() · wmSheet.status()
 */
(function () {
  var OLD = 'dimelog_', NEW = 'wm_', STAMP = 'wm__stamp:', SKIP = { 'wm_privacy': 1, 'wm_div_chart_years': 1, 'wm_fx_chart_opt': 1 };
  var P = Storage.prototype, g = P.getItem, s = P.setItem, r = P.removeItem;
  var map = function (k) { return (typeof k === 'string' && k.indexOf(OLD) === 0) ? NEW + k.slice(OLD.length) : k; };
  var cfg = window.WM_SHEET || null, timer = null, busy = false, last = { push: null, pull: null, err: null };

  // ---- 1) one-time copy dimelog_* -> wm_*
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(OLD) === 0) { var nk = map(k); if (g.call(localStorage, nk) === null) s.call(localStorage, nk, g.call(localStorage, k)); }
    }
  } catch (e) { console.warn('wm prefix migrate', e); }

  P.getItem = function (k) { return g.call(this, map(k)); };
  P.removeItem = function (k) { k = map(k); var x = r.call(this, k); if (this === localStorage) changed(k); return x; };
  P.setItem = function (k, v) { k = map(k); var x = s.call(this, k, v); if (this === localStorage) changed(k); return x; };

  function changed(k) {
    if (!k || k.indexOf(NEW) !== 0 || k.indexOf(STAMP) === 0 || SKIP[k]) return;
    s.call(localStorage, STAMP + k, new Date().toISOString());
    if (!cfg) return; clearTimeout(timer); timer = setTimeout(push, 3000);
  }

  function api(body) {
    body.token = cfg.token;
    var once = function () { return fetch(cfg.endpoint, { method: 'POST', body: JSON.stringify(body) }).then(function (x) { return x.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || 'API error'); return j; }); };
    // v2: retry (Apps Script cold start / transient HTML error page shows up as a CORS error)
    return once().catch(function () { return new Promise(function (ok) { setTimeout(ok, 2500); }).then(once); })
      .catch(function () { return new Promise(function (ok) { setTimeout(ok, 6000); }).then(once); });
  }
  // v2: a Sheet cell holds max 50,000 chars -> split long Settings json into parts key#0, key#1, ...
  var PART = 40000, CHUNK = 150;
  function splitSettings(rows) { var out = []; rows.forEach(function (o) { var j = String(o.json || ''), n = Math.max(1, Math.ceil(j.length / PART));
    for (var i = 0; i < n; i++) out.push({ key: o.key + '#' + i, json: j.slice(i * PART, (i + 1) * PART), updated_at: o.updated_at }); }); return out; }
  function J(k, d) { try { var v = g.call(localStorage, k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function chip(t, bad) {
    var c = document.getElementById('wm-sync-chip');
    if (!c && document.body) { c = document.createElement('div'); c.id = 'wm-sync-chip';
      c.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9999;font-size:11px;padding:3px 10px;border-radius:999px;background:var(--bg2,#fff);border:1px solid #ccc;box-shadow:0 1px 4px rgba(0,0,0,.15);cursor:pointer';
      c.title = 'WealthMan ↔ Google Sheet (click = push now)'; c.onclick = function () { push(); }; document.body.appendChild(c); }
    if (c) { c.textContent = t; c.style.color = bad ? '#dc2626' : '#16a34a'; }
  }

  // ---- 2) push
  function rowsFromLocal() {
    var settings = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(NEW) === 0 && k.indexOf(STAMP) !== 0 && !SKIP[k])
        settings.push({ key: k, json: g.call(localStorage, k), updated_at: g.call(localStorage, STAMP + k) || '' });
    }
    var trades = [], seen = {};
    function addT(t, src) {
      // v5: txn_id is per confirmation SLIP (one slip can hold several orders) -> key = txn_id|order_no (fallback: security|units)
      if (!t) return; var base = t.txn_id || t.mid || t.id || [t.iso_date, t.security, t.type].join('|');
      var id = base + '|' + (t.order_no || ((t.security || '') + ':' + (t.units == null ? '' : t.units)));
      if (seen[id]) return; seen[id] = 1;
      var o = {}; Object.keys(t).forEach(function (f) { o[f] = t[f]; }); o.trade_key = id; o.txn_id = t.txn_id || base; o.source = src; trades.push(o);
    }
    var man = J(NEW + 'manual_trx', []); (Array.isArray(man) ? man : Object.values(man || {})).forEach(function (t) { addT(t, 'manual'); });
    ((window.INV_DATA && window.INV_DATA.trades) || []).forEach(function (t) { addT(t, 'pdf'); });

    var del = J(NEW + 'dividends_deleted', []), delSet = {}; (Array.isArray(del) ? del : Object.keys(del || {})).forEach(function (x) { delSet[String(x)] = 1; });
    var divs = [], dseen = {};
    function addD(d, src) {
      if (!d || !d.security) return; var id = d.security + '|' + (d.pay_date || '');
      if (dseen[id]) return; dseen[id] = 1;
      var o = {}; Object.keys(d).forEach(function (f) { o[f] = d[f]; }); o.div_id = id; o.source = src; o.deleted = delSet[id] ? 'Y' : ''; divs.push(o);
    }
    var imp = J(NEW + 'dividends_import', []); (Array.isArray(imp) ? imp : (imp && imp.dividends) || []).forEach(function (d) { addD(d, 'import'); });
    ((window.INV_DIVIDENDS && window.INV_DIVIDENDS.dividends) || []).forEach(function (d) { addD(d, 'file'); });

    var pr = Object.assign({}, (window.DIME_PRICES && (window.DIME_PRICES.prices || window.DIME_PRICES)) || {}, J(NEW + 'prices', {}));
    var pd = J(NEW + 'price_dates', {}), pu = J(NEW + 'price_unit', {}), ty = J(NEW + 'sec_types', {});
    var secs = Object.keys(pr).filter(function (k) { return typeof pr[k] !== 'object' || pr[k] === null; }).map(function (k) {
      return { security: k, price: pr[k], price_date: pd[k] || '', price_unit: pu[k] || '', type: (typeof ty[k] === 'object' ? JSON.stringify(ty[k]) : (ty[k] || '')) };
    });

    var fxm = Object.assign({}, (window.INV_FX && window.INV_FX.rates) || {}, J(NEW + 'fx', {}));
    var fx = Object.keys(fxm).map(function (d) { var v = fxm[d]; return { fx_id: d + '|USD', date: d, ccy: 'USD', rate: (v && typeof v === 'object') ? (v.rate || v.v || '') : v, source: 'app' }; });
    return { Settings: settings, Trades: trades, Dividends: divs, Securities: secs, FX: fx };
  }
  function push() {
    if (!cfg || busy) return Promise.resolve(); busy = true; chip('⏳ saving to Sheet…');
    var d; try { d = rowsFromLocal(); } catch (e) { busy = false; chip('⚠ Sheet sync error', 1); console.error(e); return Promise.resolve(); }
    // v3 SAFETY: never push before a successful pull in this page load (prevents an empty/new browser overwriting the Sheet)
    if (!pulledOK) { busy = false; chip('⚠ not synced: Sheet not loaded yet', 1); return Promise.resolve(); }
    // v3 SAFETY: refuse if this browser has much less data than the Sheet (e.g. cleared browser)
    if (sheetKeys > 0 && d.Settings.length < Math.ceil(sheetKeys * 0.5)) {
      busy = false; chip('⚠ blocked: this browser has less data than Sheet', 1);
      console.warn('wm push blocked: local keys', d.Settings.length, '< sheet keys', sheetKeys); return Promise.resolve(); }
    d.Settings = splitSettings(d.Settings);
    var tabs = ['Settings', 'Trades', 'Dividends', 'Securities', 'FX'];
    // v3 SAFETY: Settings (source of truth) is UPSERT ONLY — never wiped, never deleted; Sheet keeps old values in History tab.
    // Readable tabs (Trades/Dividends/Securities/FX) are rebuilt from Settings + files; never sent empty.
    var jobs = []; tabs.forEach(function (t) { var R = d[t] || []; if (!R.length) return;
      for (var i = 0; i < R.length; i += CHUNK) jobs.push({ action: (t !== 'Settings' && i === 0) ? 'replace' : 'upsert', tab: t, rows: R.slice(i, i + CHUNK) }); });
    // Settings first, so the source of truth is safe even if a later chunk fails
    return jobs.reduce(function (p, b, n) { return p.then(function () { chip('⏳ saving ' + (n + 1) + '/' + jobs.length); return api(b); }); }, Promise.resolve())
      .then(function () { last.push = new Date().toISOString(); last.err = null; chip('✓ Sheet synced'); })
      .catch(function (e) { last.err = String(e); chip('⚠ Sheet sync failed', 1); console.warn('wm push', e); })
      .then(function () { busy = false; });
  }

  // ---- 3) pull
  function pull() {
    if (!cfg) return Promise.resolve(false);
    return api({ action: 'get' }).then(function (j) {
      var raw = (j.data && j.data.Settings) || [], n = 0, grp = {};
      pulledOK = true;
      // v2: re-join split parts key#0, key#1 ...
      raw.forEach(function (o) { var m = /^(.*)#(\d+)$/.exec(String(o.key || '')), k = m ? m[1] : String(o.key || ''), i = m ? +m[2] : 0;
        (grp[k] = grp[k] || { key: k, parts: [], updated_at: o.updated_at }).parts[i] = String(o.json == null ? '' : o.json); });
      var rows = Object.keys(grp).map(function (k) { return { key: k, json: grp[k].parts.join(''), updated_at: grp[k].updated_at }; });
      sheetKeys = rows.length;
      rows.forEach(function (o) {
        if (!o.key || String(o.key).indexOf(NEW) !== 0) return;
        var mine = g.call(localStorage, STAMP + o.key) || '';
        if (String(o.updated_at || '') > mine && g.call(localStorage, o.key) !== String(o.json)) {
          // v3 SAFETY: keep this browser's previous value before overwriting (restore: wmSheet.restorePrev())
          var old = g.call(localStorage, o.key); if (old != null) try { s.call(localStorage, 'wm__prev:' + o.key, old); } catch (e) {}
          s.call(localStorage, o.key, String(o.json)); s.call(localStorage, STAMP + o.key, String(o.updated_at)); n++;
        }
      });
      last.pull = new Date().toISOString();
      // first run: Sheet empty -> upload everything from this browser
      // v4: also upload when the readable tabs are still empty (e.g. an earlier attempt wrote only Settings)
      if (!rows.length || !((j.data && j.data.Trades) || []).length) { setTimeout(push, 1500); }
      return n > 0;
    });
  }
  var pulledOK = false, sheetKeys = 0;
  function restorePrev() { var n = 0; for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i);
      if (k && k.indexOf('wm__prev:') === 0) { s.call(localStorage, k.slice(9), g.call(localStorage, k)); n++; } } return n + ' key(s) restored — reload the page'; }
  window.wmSheet = { push: push, pull: pull, restorePrev: restorePrev,
    status: function () { return Object.assign({ configured: !!cfg, pulledOK: pulledOK, sheetKeys: sheetKeys }, last); } };

  if (cfg) {
    pull().then(function (changedAny) {
      if (changedAny && !sessionStorage.getItem('wm_pulled')) { sessionStorage.setItem('wm_pulled', '1'); location.reload(); return; }
      sessionStorage.removeItem('wm_pulled'); chip('✓ Sheet synced');
    }).catch(function (e) { last.err = String(e); console.warn('wm pull', e); setTimeout(function () { chip('⚠ Sheet offline', 1); }, 500); });
  }
})();
