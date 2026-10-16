/* DimeLog — core: shared data, helpers, router (single-page)
 * Panels register a render fn via DL.register('key', fn). DL.init() loads data,
 * wires the sidebar, and lazy-renders each panel the first time it's shown.
 */
window.DL = (function () {
  const S = getComputedStyle(document.documentElement);
  const C = v => S.getPropertyValue(v).trim();

  let payload = { trades: [] };
  const panels = {};        // key -> render(payload)
  const rendered = {};      // key -> bool (lazy render once)

  // ---------- shared helpers ----------
  const fmt = (n, d = 2) => (n == null || isNaN(n)) ? '' :
    Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- privacy mode: ซ่อนจำนวนเงิน (โชว์ %) สำหรับแคปอวด ----------
  const PRIV_KEY = 'dimelog_privacy';
  let priv = false;
  try { priv = localStorage.getItem(PRIV_KEY) === '1'; } catch (e) {}
  const isPrivate = () => priv;
  function setPrivate(on) {
    priv = !!on;
    try { localStorage.setItem(PRIV_KEY, priv ? '1' : '0'); } catch (e) {}
    document.body.classList.toggle('privacy-on', priv);
    const btn = document.getElementById('privToggle');
    if (btn) btn.innerHTML = priv ? '🙈 โชว์ตัวเลข' : '👁️ ซ่อนตัวเลข';
    // re-render ทุก panel ที่เคย render แล้ว เพื่อให้ค่าเงินถูกปิด/เปิด
    Object.keys(rendered).forEach(k => rendered[k] = false);
    const active = document.querySelector('.dl-sb a.active');
    show(active ? active.getAttribute('data-nav') : 'dashboard');
  }
  function togglePrivacy() { setPrivate(!priv); }
  // money(): ถ้าโหมดซ่อน คืน ••••• ไม่งั้น fmt ปกติ. ใช้กับ"จำนวนเงิน"เท่านั้น (ไม่ใช่ % / หน่วย / ราคาต่อหน่วย)
  const money = (n, d = 2) => priv ? '•••••' : fmt(n, d);
  const dmy = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const isBuy = t => t.type === 'BUY' || t.type === 'SUB';
  const isSell = t => t.type === 'SEL' || t.type === 'RED';
  const clsLabel = c => ({offshore:'Offshore', mutual_fund:'Mutual Fund', gold:'Gold'}[c] || (c || '—'));

  // สร้างตัวเลือก dropdown "ชนิดสินทรัพย์" จากข้อมูลจริง (ไม่ fix ค่า) — asset_class ใหม่โผล่เองอัตโนมัติ
  function buildClassOptions(selectEl, allLabel) {
    if (!selectEl) return;
    const prev = selectEl.value;
    const classes = [...new Set((payload.trades || []).map(t => t.asset_class).filter(Boolean))].sort();
    selectEl.innerHTML = `<option value="">${allLabel || 'All classes'}</option>` +
      classes.map(c => `<option value="${c}">${clsLabel(c)}</option>`).join('');
    if (prev) selectEl.value = prev;   // คงค่าที่เลือกไว้
  }

  // ---------- security type classification (localStorage) ----------
  const SEC_TYPES = ['ETF', 'Open-End Fund', 'US Stock', 'REIT', 'Bond/Fixed Income', 'Gold', 'Crypto', 'Other'];
  // ค่า default ที่ระบบใส่ให้ (ผู้ใช้แก้ทับได้) — จาก lookup ชนิดหลักทรัพย์จริง
  const DEFAULT_TYPES = {
    'JEPQ':'ETF','QQQI':'ETF','QQQM':'ETF','SCHD':'ETF','SMH':'ETF','VOO':'ETF',
    'SGOV':'Bond/Fixed Income',
    'O':'REIT',
    'AAPL':'US Stock','AMZN':'US Stock','GOOGL':'US Stock','HUT':'US Stock','JBL':'US Stock',
    'LMT':'US Stock','MSFT':'US Stock','MU':'US Stock','NFLX':'US Stock','NVDA':'US Stock',
    'ORCL':'US Stock','RKLB':'US Stock','TSM':'US Stock',
    'ASP-S&P500':'Open-End Fund','ASP-S&P500-A':'Open-End Fund','SCBS&P500':'Open-End Fund',
    'Gold 96.5%':'Gold',
  };
  const TYPE_KEY = 'dimelog_sec_types';
  function loadTypes() {
    try { return JSON.parse(localStorage.getItem(TYPE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveTypes(map) {
    try { localStorage.setItem(TYPE_KEY, JSON.stringify(map || {})); } catch (e) {}
  }
  // ลำดับ: ค่าที่ผู้ใช้ตั้งเอง > ค่า default ของระบบ > ว่าง
  function typeOf(security) { return (loadTypes()[security]) || DEFAULT_TYPES[security] || ''; }
  function userTypeOf(security) { return (loadTypes()[security]) || ''; }  // เฉพาะที่ตั้งเอง (ไม่รวม default)
  function setType(security, type) {
    const m = loadTypes(); if (type) m[security] = type; else delete m[security]; saveTypes(m);
  }

  function register(key, fn) { panels[key] = fn; }

  function show(key) {
    // leaving Classify: types may have changed → let dashboard/tax re-render with latest types
    const prev = document.querySelector('.dl-sb a.active');
    if (prev && prev.getAttribute('data-nav') === 'classify' && key !== 'classify') {
      rendered['dashboard'] = false; rendered['tax'] = false; rendered['holdings'] = false; rendered['analysis'] = false;
    }
    // leaving Holdings: ราคาปัจจุบันอาจเปลี่ยน → ให้ Dashboard re-render กำไร/ขาดทุนใหม่
    if (prev && prev.getAttribute('data-nav') === 'holdings' && key !== 'holdings') {
      rendered['dashboard'] = false; rendered['analysis'] = false;
    }
    // leaving Dividends: อาจ import ปันผลเพิ่ม → ให้ Dashboard/Tax re-render
    if (prev && prev.getAttribute('data-nav') === 'dividends' && key !== 'dividends') {
      rendered['dashboard'] = false; rendered['tax'] = false; rendered['analysis'] = false;
    }
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('panel-' + key);
    if (el) el.classList.add('active');
    document.querySelectorAll('.dl-sb a[data-nav]').forEach(a =>
      a.classList.toggle('active', a.getAttribute('data-nav') === key));
    // lazy render on first view (charts/grid need visible container for correct sizing)
    if (!rendered[key] && panels[key]) {
      try { panels[key](payload); } catch (e) { console.error('panel ' + key + ' error', e); }
      rendered[key] = true;
    }
    if (location.hash !== '#' + key) history.replaceState(null, '', '#' + key);
  }

  // force re-render of all panels (e.g. after Import replaces data)
  function refreshAll() {
    for (const k in rendered) rendered[k] = false;
    const cur = document.querySelector('.dl-sb a.active');
    show(cur ? cur.getAttribute('data-nav') : 'dashboard');
  }

  function setPayload(p) { payload = p || { trades: [] }; }

  function init() {
    // wire sidebar
    document.querySelectorAll('.dl-sb a[data-nav]').forEach(a =>
      a.addEventListener('click', e => { e.preventDefault(); show(a.getAttribute('data-nav')); }));

    // privacy toggle (ซ่อนตัวเลขเงิน)
    const pbtn = document.getElementById('privToggle');
    if (pbtn) {
      pbtn.innerHTML = priv ? '🙈 โชว์ตัวเลข' : '👁️ ซ่อนตัวเลข';
      pbtn.addEventListener('click', togglePrivacy);
    }
    document.body.classList.toggle('privacy-on', priv);

    // load data: embedded (window.INV_DATA) first, else fetch json
    const start = () => {
      const key = (location.hash || '#dashboard').slice(1);
      show(panels[key] ? key : 'dashboard');
    };
    if (window.INV_DATA) { setPayload(window.INV_DATA); start(); }
    else {
      fetch('data/inv_log.json').then(r => r.json()).then(p => { setPayload(p); start(); })
        .catch(() => {
          setPayload({ trades: [] });
          const s = document.getElementById('dashSub');
          if (s) s.textContent = 'โหลดข้อมูลไม่ได้ — วางไฟล์ data/inv_data.js หรือ data/inv_log.json';
          start();
        });
    }
  }

  return { C, fmt, money, dmy, isBuy, isSell, clsLabel, buildClassOptions, register, show, refreshAll, setPayload, init,
           SEC_TYPES, DEFAULT_TYPES, loadTypes, saveTypes, typeOf, userTypeOf, setType,
           isPrivate, setPrivate, togglePrivacy,
           get payload() { return payload; } };
})();
