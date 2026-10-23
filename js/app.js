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
  // ---------- Asset Class master (localStorage, แก้ได้ใน Settings) ----------
  // key = รหัสภายใน (offshore/mutual_fund/gold/...) · value = { label, builtin }
  const DEFAULT_CLASSES = {
    offshore:    { label: 'Offshore',    builtin: true },
    mutual_fund: { label: 'Mutual Fund', builtin: true },
    gold:        { label: 'Gold',        builtin: true }
  };
  const CLASS_KEY = 'dimelog_asset_classes';
  function loadClasses() {
    let user = {};
    try { user = JSON.parse(localStorage.getItem(CLASS_KEY) || '{}') || {}; } catch (e) {}
    return Object.assign({}, DEFAULT_CLASSES, user);
  }
  function saveClasses(m) { try { localStorage.setItem(CLASS_KEY, JSON.stringify(m || {})); } catch (e) {} }
  function resetClasses() { try { localStorage.removeItem(CLASS_KEY); } catch (e) {} }
  // รายการ class ทั้งหมด (master + ที่โผล่ใน trx แต่ยังไม่มีใน master) → [{key,label,builtin}]
  function allClasses() {
    const m = loadClasses();
    try { (payload.trades || []).forEach(t => { if (t.asset_class && !m[t.asset_class]) m[t.asset_class] = { label: t.asset_class, builtin: false }; }); } catch (e) {}
    return Object.keys(m).map(k => ({ key: k, label: (m[k] && m[k].label) || k, builtin: !!(m[k] && m[k].builtin) }));
  }
  const clsLabel = c => { const m = loadClasses(); return (m[c] && m[c].label) || (c || '—'); };

  // สร้างตัวเลือก dropdown "ชนิดสินทรัพย์" จากข้อมูลจริง (ไม่ fix ค่า) — asset_class ใหม่โผล่เองอัตโนมัติ
  function buildClassOptions(selectEl, allLabel) {
    if (!selectEl) return;
    const prev = selectEl.value;
    const classes = allClasses();
    selectEl.innerHTML = `<option value="">${allLabel || 'All classes'}</option>` +
      classes.map(c => `<option value="${c.key}">${c.label}</option>`).join('');
    if (prev) selectEl.value = prev;   // คงค่าที่เลือกไว้
  }

  // ---------- security type classification (localStorage) ----------
  // type พื้นฐาน (security type) — รวมกองทุนลดหย่อนภาษี (RMF/SSF/Thai ESG/LTF) ที่มีเงื่อนไข sellable
  const SEC_TYPES_BASE = ['ETF', 'Open-End Fund', 'US Stock', 'REIT', 'Bond/Fixed Income', 'Gold', 'Crypto', 'Other'];
  // รวม type ทั้งหมด: base + type ที่มีใน fund rules (label) — dedupe คงลำดับ
  function allTypes() {
    const ruleLabels = Object.keys(loadFundRules()).map(k => (loadFundRules()[k] && loadFundRules()[k].label) || k);
    const seen = new Set(); const out = [];
    SEC_TYPES_BASE.concat(ruleLabels).forEach(t => { const key = String(t).toUpperCase(); if (t && !seen.has(key)) { seen.add(key); out.push(t); } });
    return out;
  }
  const SEC_TYPES = SEC_TYPES_BASE;  // สำรอง (โค้ดเก่าใช้ DL.SEC_TYPES) — ที่รีเฟรชควรเรียก DL.allTypes()
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
    'GLDOZUSD':'Gold','Gold (MTS)':'Gold',
    'B-LTF':'LTF','VALUE-D LTF':'LTF','KTLF-L':'LTF','KSET50LTF':'LTF',
    'IN-RMF':'RMF','B-INNOTECHRMF':'RMF',
    'K-ESGSI-ThaiESG':'Thai ESG',
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
  // type นี้มีเงื่อนไข sellable ไหม (ตรงกับ key ใน fund rules)
  function typeIsSellable(type) {
    if (!type) return false;
    const t = String(type).toUpperCase().replace(/\s+/g, ' ').trim();
    const R = loadFundRules();
    return Object.keys(R).some(k => { const lb = (R[k] && R[k].label) || k; return String(lb).toUpperCase() === t || k === t; });
  }
  // คิดวันขายได้จาก type ของ security (แทน fund_type ต่อ trx)
  function sellableByType(security, buyIso, birthIso) {
    const ty = typeOf(security);
    return typeIsSellable(ty) ? sellableDate(ty, buyIso, birthIso) : '';
  }

  function register(key, fn) { panels[key] = fn; }

  // ---------- FX rates (USD→THB) : seed data/fx.js (window.INV_FX) + localStorage override ----------
  // เก็บเป็น { 'yyyy-mm-dd': rate(฿ ต่อ 1 USD) } · ผู้ใช้กรอก/Import เพิ่มทับ seed ได้
  const FX_KEY = 'dimelog_fx';
  function fxSeed() { try { return (window.INV_FX && window.INV_FX.rates) || {}; } catch (e) { return {}; } }
  // เรทจริงจาก trx ที่มี fx_thb_usd (ใบยืนยัน offshore) — ถ้าวันเดียวมีหลายรายการ ใช้ค่าหลังสุด
  function fxFromTrx() {
    const out = {};
    try {
      (payload.trades || []).forEach(t => {
        const r = t.fx_thb_usd;
        if (r != null && r !== '' && t.iso_date) out[t.iso_date] = +r;
      });
    } catch (e) {}
    return out;
  }
  function loadFx() {
    let user = {};
    try { user = JSON.parse(localStorage.getItem(FX_KEY) || '{}') || {}; } catch (e) {}
    // ลำดับทับ: trx (เรทจริงจากใบยืนยัน) < seed < user(กรอกเอง) → ผู้ใช้/seed แก้ทับ trx ได้
    return Object.assign({}, fxFromTrx(), fxSeed(), user);
  }
  function saveFx(map) { try { localStorage.setItem(FX_KEY, JSON.stringify(map || {})); } catch (e) {} }
  // เรท ณ วันที่ iso: ตรงวันถ้ามี ไม่งั้น "วันใกล้สุด" (ผลต่างวันน้อยสุด) · todayRate = fallback สุดท้าย
  function fxRate(iso, map) {
    map = map || loadFx();
    const keys = Object.keys(map);
    if (!keys.length) return null;
    if (iso && map[iso] != null) return +map[iso];
    if (!iso) { // ไม่มีวัน → เรทล่าสุด
      keys.sort(); return +map[keys[keys.length - 1]];
    }
    const t = Date.parse(iso);
    let best = null, bestDiff = Infinity;
    keys.forEach(k => { const d = Math.abs(Date.parse(k) - t); if (d < bestDiff) { bestDiff = d; best = k; } });
    return best == null ? null : +map[best];
  }
  // แปลง usd→thb ด้วยเรทวันนั้น · คืน null ถ้าไม่มีเรท
  function usdToThb(usd, iso, map) {
    if (usd == null || usd === '') return null;
    const r = fxRate(iso, map); return r == null ? null : usd * r;
  }
  // สตริงแสดง THB ต่อท้าย USD: "$3.00 (≈฿109)" · ซ่อนตัวเลขเมื่อ privacy
  function thbSuffix(usd, iso, map) {
    const v = usdToThb(usd, iso, map);
    if (v == null) return '';
    return priv ? ' (≈฿•••)' : ` (≈฿${fmt(v, 0)})`;
  }

  // ---------- price-unit divisor ต่อ security ----------
  // units ที่เก็บ อาจคนละหน่วยกับ "ราคาที่กรอก" (เช่น ทอง HSH: units=กรัม แต่ราคา=บาท/บาททอง)
  // divisor = ราคา 1 หน่วยที่กรอก เท่ากับกี่ units ที่เก็บ → มูลค่าตลาด = price × (units ÷ divisor)
  // default 1 (ไม่กระทบหุ้น/กองทุนที่หน่วยตรงกันอยู่แล้ว)
  const PUNIT_KEY = 'dimelog_price_unit';
  const PUNIT_SEED = { 'Gold 96.5%': 15.244 };   // 1 บาททอง = 15.244 กรัม
  function loadDivisors() {
    let user = {};
    try { user = JSON.parse(localStorage.getItem(PUNIT_KEY) || '{}') || {}; } catch (e) {}
    return Object.assign({}, PUNIT_SEED, user);
  }
  function saveDivisors(map) { try { localStorage.setItem(PUNIT_KEY, JSON.stringify(map || {})); } catch (e) {} }
  function priceDivisor(sym, map) {
    map = map || loadDivisors();
    const d = +map[sym];
    return (d && d > 0) ? d : 1;
  }

  function show(key) {
    try{window.scrollTo(0,0);}catch(_){}
    // leaving Classify: types may have changed → let dashboard/tax re-render with latest types
    const prev = document.querySelector('.dl-sb a.active');
    if (prev && prev.getAttribute('data-nav') === 'classify' && key !== 'classify') {
      rendered['dashboard'] = false; rendered['tax'] = false; rendered['holdings'] = false; rendered['analysis'] = false;
    }
    // leaving Holdings: ราคาปัจจุบันอาจเปลี่ยน → ให้ Dashboard re-render กำไร/ขาดทุนใหม่
    if (prev && prev.getAttribute('data-nav') === 'holdings' && key !== 'holdings') {
      rendered['dashboard'] = false; rendered['analysis'] = false;
    }
    // leaving FX Rates: เรทอาจเปลี่ยน → หน้าที่แปลง USD→THB ต้อง re-render
    if (prev && prev.getAttribute('data-nav') === 'fx' && key !== 'fx') {
      rendered['dashboard'] = false; rendered['tax'] = false; rendered['holdings'] = false; rendered['analysis'] = false;
    }
    // leaving Settings: ตัวหารหน่วยราคา (price-unit) อาจเปลี่ยน → re-render หน้าที่คำนวณมูลค่า
    if (prev && prev.getAttribute('data-nav') === 'setup' && key !== 'setup') {
      rendered['dashboard'] = false; rendered['holdings'] = false; rendered['analysis'] = false;
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

  // ---------- Manual transactions (localStorage) : merged with parser trades at read time ----------
  // auto trx มาจาก parser (payload.trades) · manual trx กรอกเอง/Import Excel เก็บแยกใน localStorage
  // → ไม่โดน parser rebuild ทับ · รวมกันตอนอ่านผ่าน DL.allTrades()
  const MANUAL_KEY = 'dimelog_manual_trx';
  function excelSerialToIso(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' || /^[0-9]+(\.[0-9]+)?$/.test(String(v).trim())) {
      const n = Math.round(parseFloat(v));
      if (n > 20000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return d.toISOString().slice(0, 10); }
    }
    return String(v).trim().slice(0, 10);
  }
  function loadManual() {
    let a = [];
    try { a = JSON.parse(localStorage.getItem(MANUAL_KEY) || '[]') || []; } catch (e) { return []; }
    let dirty = false;
    a.forEach(t => {
      const effFixed = excelSerialToIso(t.effective_date);
      if (effFixed !== (t.effective_date || '')) { t.effective_date = effFixed; dirty = true; }
      const selFixed = excelSerialToIso(t.sellable_date);
      if (selFixed !== (t.sellable_date || '')) { t.sellable_date = selFixed; dirty = true; }
    });
    if (dirty) { try { localStorage.setItem(MANUAL_KEY, JSON.stringify(a)); } catch (e) {} }
    return a;
  }
  function saveManual(arr) { try { localStorage.setItem(MANUAL_KEY, JSON.stringify(arr || [])); } catch (e) {} }
  function addManual(trx) { const a = loadManual(); a.push(trx); saveManual(a); }
  function deleteManual(id) { saveManual(loadManual().filter(t => t._mid !== id)); }
  function genMid() { return 'M' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  // รวม auto (parser) + manual → ใช้แทน payload.trades ทั่วแอป
  function allTrades() {
    const auto = (payload.trades || []).map(t => Object.assign({ _manual: false }, t));
    const manual = loadManual().map(t => Object.assign({ _manual: true }, t));
    return auto.concat(manual);
  }

  // ---------- Asset Manager (AM) master — id-based (immutable id + mutable name) ----------
  // หลักการ user-locked: อ้างอิงด้วย id คงที่ (am<N>) ไม่ใช่ชื่อ → แก้ชื่อไม่กระทบ trx
  // master: { am1:{name, remark, source}, am2:{...} } · auto trx จาก parser มี asset_manager=ชื่อ → resolve เป็น id ตอนโหลด (สร้างให้ถ้ายังไม่มี)
  const AM_KEY = 'dimelog_am_master';
  function loadAMraw() { try { return JSON.parse(localStorage.getItem(AM_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveAM(m) { try { localStorage.setItem(AM_KEY, JSON.stringify(m || {})); } catch (e) {} }
  // migration: ถ้า key เดิมเป็นชื่อ (ไม่ match am\d+) → แปลงเป็น id-keyed ครั้งเดียว
  function loadAM() {
    const m = loadAMraw();
    const keys = Object.keys(m).filter(k => k !== '_seq');
    // ทำให้ name เป็น "string" เสมอ (กันเคส [object Object] จากการ migrate ซ้ำ/ค่าเพี้ยน)
    const asName = (v, fallback) => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') return (typeof v.name === 'string' ? v.name : fallback);
      return fallback;
    };
    const legacy = keys.some(k => !/^am\d+$/.test(k));
    if (!legacy) {
      // ซ่อม record ที่ name เพี้ยน (object) ให้เป็น string
      let dirty = false;
      keys.forEach(id => { const cur = m[id]; if (cur && typeof cur.name !== 'string') { cur.name = asName(cur.name, id); dirty = true; } });
      if (dirty) saveAM(m);
      return m;
    }
    const out = {}; let seq = 0;
    keys.forEach(k => { seq++; out['am' + seq] = { name: asName(m[k], k) !== k ? asName(m[k], k) : k, remark: (m[k] && m[k].remark) || '', source: (m[k] && m[k].source) || 'manual' }; });
    out._seq = seq; saveAM(out); return out;
  }
  function amNextId(m) { m = m || loadAM(); const n = (m._seq || 0) + 1; return { id: 'am' + n, seq: n }; }
  function amName(id) { const m = loadAM(); const nm = m[id] && m[id].name; return (typeof nm === 'string' && nm) ? nm : (id || ''); }
  // รับ id หรือชื่อ → คืน id · ถ้าเป็นชื่อที่ยังไม่มีใน master และ create=true → สร้าง id ให้ (ใช้กับ auto trx)
  function amId(x, create, source) {
    if (!x) return '';
    const m = loadAM();
    if (m[x]) return x;                               // เป็น id อยู่แล้ว
    const hit = Object.keys(m).find(k => k !== '_seq' && m[k].name === x);
    if (hit) return hit;
    if (create) { const { id, seq } = amNextId(m); m[id] = { name: x, remark: '', source: source || 'manual' }; m._seq = seq; saveAM(m); return id; }
    return '';
  }
  // รายการ AM ทั้งหมด (จาก master + ชื่อใน auto trx ที่ยังไม่ถูกสร้าง) → [{id,name,source}]
  function allAMs() {
    // auto-create id ให้ชื่อ AM จาก parser ที่ยังไม่มีใน master
    allTrades().forEach(t => { if (!t._manual && t.asset_manager) amId(t.asset_manager, true, 'auto'); });
    const m = loadAM();
    return Object.keys(m).filter(k => k !== '_seq').map(id => {
      const nm = m[id] && m[id].name;
      return { id, name: (typeof nm === 'string' && nm) ? nm : id, source: (m[id] && m[id].source) || 'manual' };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  // คืน am_id ของ trx: manual ใช้ t.am_id · auto ใช้ชื่อ t.asset_manager → resolve เป็น id
  function trxAmId(t) { return t._manual ? (t.am_id || '') : amId(t.asset_manager, true, 'auto'); }
  function trxAmName(t) { const id = trxAmId(t); return id ? amName(id) : (t.asset_manager || ''); }

  // ---------- User profile (localStorage) — birthdate ใช้คำนวณ RMF (อายุ 55) ----------
  const PROFILE_KEY = 'dimelog_profile';
  function loadProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p || {})); } catch (e) {} }

  // ---------- Thai tax-fund sellable date ----------
  // RMF = max(ซื้อ+5ปี, วันเกิด+55ปี) · SSF = ซื้อ+10ปี · Thai ESG/ESGX = ซื้อ+5ปี · อื่น = ขายได้เลย
  function addYears(iso, y) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; d.setFullYear(d.getFullYear() + y); return d.toISOString().slice(0, 10); }
  const DEFAULT_FUND_RULES = {
    'RMF':       { holdYears: 5,  minAge: 55,   basis: 'anniversary', label: 'RMF' },
    'SSF':       { holdYears: 10, minAge: null, basis: 'anniversary', label: 'SSF' },
    'THAI ESG':  { holdYears: 5,  minAge: null, basis: 'anniversary', label: 'Thai ESG' },
    'THAI ESGX': { holdYears: 5,  minAge: null, basis: 'anniversary', label: 'Thai ESGX' },
    'LTF':       { holdYears: 7,  minAge: null, basis: 'calendar',    label: 'LTF' }
  };
  function loadFundRules() {
    try { const r = JSON.parse(localStorage.getItem('dimelog_fund_rules') || 'null'); if (r && typeof r === 'object') return Object.assign({}, DEFAULT_FUND_RULES, r); } catch (e) {}
    return Object.assign({}, DEFAULT_FUND_RULES);
  }
  function saveFundRules(r) { localStorage.setItem('dimelog_fund_rules', JSON.stringify(r || {})); }
  function resetFundRules() { localStorage.removeItem('dimelog_fund_rules'); }
  // คืนวันที่ขายได้ (sellable) ตามเงื่อนไขกองทุน
  // basis='anniversary' → วันชนวัน (วันซื้อ + N ปี) — RMF/SSF/Thai ESG
  // basis='calendar' → นับปีปฏิทิน — LTF: ขายได้ 1 ม.ค. ของปี (ปีที่ซื้อ + N − 1)
  function sellableDate(fundType, buyIso, birthIso) {
    const ft = (fundType || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const key = (ft === 'ESG' || ft === 'THAIESG') ? 'THAI ESG' : (ft === 'ESGX' ? 'THAI ESGX' : ft);
    const rule = loadFundRules()[key];
    if (!rule || !buyIso) return '';
    let a = '';
    if (rule.holdYears != null) {
      if (rule.basis === 'calendar') {
        const by = parseInt(String(buyIso).slice(0, 4), 10);
        if (!isNaN(by)) a = (by + rule.holdYears - 1) + '-01-01';
      } else {
        a = addYears(buyIso, rule.holdYears);
      }
    }
    const b = (rule.minAge != null && birthIso) ? addYears(birthIso, rule.minAge) : '';
    if (a && b) return a > b ? a : b;
    return a || b || '';
  }
  // fund_type ดึงจาก Fund Rules master (keys) — ไม่ hardcode ซ้ำกับ Settings
  function fundTypes() {
    const R = loadFundRules();
    const labels = Object.keys(R).map(k => (R[k] && R[k].label) || k);
    return [''].concat(labels);
  }
  const FUND_TYPES = fundTypes();  // สำรองเดิม (โค้ดเก่าใช้ DL.FUND_TYPES) — ที่รีเฟรชควรเรียก DL.fundTypes()

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

  return { C, fmt, money, dmy, isBuy, isSell, clsLabel, buildClassOptions, loadClasses, saveClasses, resetClasses, allClasses, DEFAULT_CLASSES, register, show, refreshAll, setPayload, init,
           SEC_TYPES, DEFAULT_TYPES, loadTypes, saveTypes, typeOf, userTypeOf, setType, allTypes, typeIsSellable, sellableByType,
           isPrivate, setPrivate, togglePrivacy,
           loadFx, saveFx, fxRate, usdToThb, thbSuffix,
           loadDivisors, saveDivisors, priceDivisor,
           loadManual, saveManual, addManual, deleteManual, genMid, allTrades,
           loadAM, saveAM, allAMs, amName, amId, amNextId, trxAmId, trxAmName,
           loadProfile, saveProfile,
           sellableDate, FUND_TYPES, fundTypes, loadFundRules, saveFundRules, resetFundRules, DEFAULT_FUND_RULES,
           get payload() { return payload; } };
})();
