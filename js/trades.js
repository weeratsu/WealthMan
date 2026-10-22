/* WealthMan — Trades panel (plain HTML table + filters + export/backup/import)
   เปลี่ยนจาก Grid Pro เป็น <table> ธรรมดา + sticky thead:
   DOM เดียว header กับ body ใช้ความกว้างคอลัมน์ร่วมกัน → ไม่มีทางเหลื่อมกันตอน resize */
DL.register('trades', function (payload) {
  const dmy = DL.dmy, clsLabel = DL.clsLabel;
  let CURRENT = [];
  let sortKey = 'date', sortDir = 1;   // 1=asc, -1=desc
  const TRADES = () => DL.allTrades();   // auto (parser) + manual (localStorage)

  const sub = document.getElementById('trdSub');
  const dates = TRADES().map(t => t.iso_date).filter(Boolean).sort();
  sub.textContent = `${DL.payload.trade_count || TRADES().length} รายการ · ช่วง ${dmy(dates[0])} – ${dmy(dates[dates.length - 1])}`;

  // security filter options (เรียง A→Z)
  const fSec = document.getElementById('fSec');
  // securities dropdown — cascades from the selected class (เลือก class แล้ว securities โชว์เฉพาะ class นั้น)
  function populateFundType() {
    const el = document.getElementById('fFundType'); if (!el) return;
    const cls = document.getElementById('fClass') ? document.getElementById('fClass').value : '';
    const prev = el.value;
    const list = [...new Set(TRADES().filter(t => !cls || t.asset_class === cls).map(t => DL.typeOf(t.security)).filter(Boolean))].sort();
    el.innerHTML = '<option value="">All fund types</option>' +
      list.map(f => `<option value="${String(f).replace(/"/g,'&quot;')}">${f}</option>`).join('');
    if (prev && list.includes(prev)) el.value = prev;
  }
  function populateSec() {
    if (!fSec) return;
    const cls = document.getElementById('fClass') ? document.getElementById('fClass').value : '';
    const tyEl = document.getElementById('fTxnType'), ftEl2 = document.getElementById('fFundType');
    const ty = tyEl ? tyEl.value : '', fty = ftEl2 ? ftEl2.value : '';
    const prev = fSec.value;
    const list = [...new Set(TRADES().filter(t =>
      (!cls || t.asset_class === cls) &&
      (!ty || txnMatch(ty, t.type)) &&
      (!fty || (DL.typeOf(t.security) || '') === fty)
    ).map(t => t.security).filter(Boolean))].sort();
    fSec.innerHTML = '<option value="">All securities</option>' +
      list.map(s => `<option value="${String(s).replace(/"/g,'&quot;')}">${s}</option>`).join('');
    // คงค่าเดิมถ้ายังอยู่ในชุดใหม่ ไม่งั้นรีเซ็ตเป็น All
    fSec.value = list.indexOf(prev) >= 0 ? prev : '';
  }
  populateSec(); populateFundType();

  // year filter options
  const fYear = document.getElementById('fYear');
  fYear.innerHTML = '<option value="">All years</option>';
  [...new Set(TRADES().map(t => (t.iso_date || '').slice(0, 4)).filter(Boolean))].sort()
    .forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; fYear.appendChild(o); });

  // class filter — สร้างจากข้อมูลจริง (ไม่ fix ค่า → asset_class ใหม่โผล่เอง)
  DL.buildClassOptions(document.getElementById('fClass'), 'All classes');

  // ---- นิยามคอลัมน์ (id, หัว, ชนิด, ฟังก์ชันดึงค่า, คำอธิบาย tooltip) ----
  const fxOf = t => { const v = t.fx_thb_usd; if (v != null && v !== '') return +v; const a = t.total_usd, b = t.total_thb; return (a && b) ? b / a : null; };
  const COLS = [
    { id:'date',  h:'วันที่',            get:t=>t.iso_date||'',          kind:'date', tip:'วันที่ทำรายการ (ตามใบยืนยัน)' },
    { id:'eff',   h:'วันมีผล',           get:t=>t.effective_date||'',    kind:'date', tip:'วันมีผล (effective/settlement) — เว้นว่างถ้าไม่มี' },
    { id:'cls',   h:'ชนิด',              get:t=>clsLabel(t.asset_class), kind:'text', tip:'ชนิดสินทรัพย์ — Offshore=หุ้นต่างประเทศ, Mutual Fund=กองทุนรวมไทย, Gold=ทองคำ' },
    { id:'ftype', h:'Type',                get:t=>DL.typeOf(t.security)||'', kind:'text', tip:'ประเภทหลักทรัพย์ (ETF/US Stock/RMF/SSF/LTF…) — กำหนดที่ Classify · ตัวที่มีเงื่อนไขจะคิดวันขายได้ให้' },
    { id:'am',    h:'Asset Manager',     get:t=>DL.trxAmName(t),         kind:'text', tip:'ผู้จัดการสินทรัพย์/ที่มา — Dime, Hua Seng Heng ฯลฯ (อ้างด้วย id ภายใน แก้ชื่อได้ที่ Settings)' },
    { id:'type',  h:'ประเภท',            get:t=>t.type||'',              kind:'text', tip:'ประเภทรายการ — SUB=ซื้อกองทุน, RED=ขายกองทุน, SWI/SWO=สับเปลี่ยนเข้า/ออก, BUY=ซื้อ, SEL=ขาย' },
    { id:'sec',   h:'หลักทรัพย์',        get:t=>t.security||'',          kind:'text', tip:'ชื่อหลักทรัพย์/กองทุน' },
    { id:'sellable', h:'ขายได้',          get:t=>isBuyish(t.type)?(t.sellable_date||''):'', kind:'date', tip:'วันที่ขายได้โดยไม่เสียสิทธิภาษี (RMF/SSF/Thai ESG/LTF) — แสดงเฉพาะรายการซื้อ (BUY/SUB)' },
    { id:'exch',  h:'ตลาด',              get:t=>t.exchange||'-',         kind:'text', tip:'ตลาดหลักทรัพย์ — กองทุนไทย/ทองเป็นผู้ให้บริการ' },
    { id:'units', h:'จำนวนหน่วย',        get:t=>t.units,                 kind:'num', dp:7, tip:'จำนวนหน่วย/หุ้น/กรัมที่ได้รับ' },
    { id:'price', h:'ราคา/หน่วย',        get:t=>t.price,                 kind:'num', dp:4, tip:'ราคาต่อหน่วย' },
    { id:'ccy',   h:'สกุล',              get:t=>t.ccy||'',               kind:'text', tip:'สกุลเงินของรายการ (THB/USD)' },
    { id:'fx',    h:'FX (THB/USD)',      get:fxOf,                       kind:'num', dp:4, dash:true, tip:'อัตราแลกเปลี่ยน THB ต่อ 1 USD (กองทุนไทย/ทองไม่มี = —)' },
    { id:'gusd',  h:'Gross (USD)',       get:t=>t.gross_usd,             kind:'money', dp:2, tip:'มูลค่ารวมก่อนหักค่าธรรมเนียม สกุล USD' },
    { id:'thb',   h:'มูลค่า (THB)',       get:t=>t.total_thb,            kind:'money', dp:2, tip:'มูลค่ารวมเป็นเงินบาท' },
    { id:'tusd',  h:'Total (USD)',       get:t=>t.total_usd,             kind:'money', dp:2, thb:true, tip:'มูลค่ารวมสุทธิ สกุล USD · วงเล็บ ≈฿ = แปลงเป็นบาทด้วยเรทวันใกล้สุด (FX Rates)' },
    { id:'fee',   h:'ค่าธรรมเนียม (THB)', get:t=>t.fee_thb,              kind:'money', dp:2, tip:'ค่าธรรมเนียมเป็นเงินบาท' },
    { id:'fusd',  h:'Fee (USD)',         get:t=>t.fee_usd,               kind:'money', dp:2, tip:'ค่าธรรมเนียม สกุล USD' },
    { id:'txn',   h:'Txn ID',            get:t=>t.txn_id||'',            kind:'text', tip:'เลขอ้างอิงรายการ (Transaction ID)' },
  ];

  const nf = (v, dp) => v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  function cellText(c, t) {
    const v = c.get(t);
    if (c.kind === 'date') return v ? dmy(v) : '';
    if (c.kind === 'text') return v == null ? '' : String(v);
    if (c.kind === 'num')  return v == null ? (c.dash ? '—' : '') : Number(v).toLocaleString('en-US', { minimumFractionDigits: c.dp === 7 ? 0 : c.dp, maximumFractionDigits: c.dp });
    if (c.kind === 'money') {
      if (v == null) return '';
      if (DL.isPrivate()) return '•••••';
      let out = nf(v, c.dp);
      // คอลัมน์ที่ตั้ง thb:true + เป็น USD → เติม (≈฿...) ด้วยเรทวันทำรายการ (เรทวันใกล้สุด)
      if (c.thb && t.ccy === 'USD') { const b = DL.usdToThb(v, t.iso_date); if (b != null) out += ` (≈฿${nf(b, 0)})`; }
      return out;
    }
    return v == null ? '' : String(v);
  }

  const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));

  function render(list) {
    CURRENT = list;
    document.getElementById('rowCount').textContent = `${list.length} รายการ`;
    // sort
    const col = COLS.find(c => c.id === sortKey) || COLS[0];
    const sorted = list.slice().sort((a, b) => {
      let va = col.get(a), vb = col.get(b);
      if (col.kind === 'num' || col.kind === 'money') { va = va == null ? -Infinity : +va; vb = vb == null ? -Infinity : +vb; return (va - vb) * sortDir; }
      va = (va == null ? '' : String(va)); vb = (vb == null ? '' : String(vb));
      return va.localeCompare(vb) * sortDir;
    });
    const alignCls = c => (c.kind === 'num' || c.kind === 'money') ? ' class="r"' : '';
    const head = '<thead><tr>' + COLS.map(c => {
      const arrow = c.id === sortKey ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
      return `<th data-k="${c.id}" title="${esc(c.tip)}"${alignCls(c)}>${esc(c.h)}${arrow}</th>`;
    }).join('') + '</tr></thead>';
    const body = '<tbody>' + sorted.map(t =>
      '<tr>' + COLS.map(c => `<td${alignCls(c)}>${esc(cellText(c, t))}</td>`).join('') + '</tr>'
    ).join('') + '</tbody>';
    document.getElementById('tableWrap').innerHTML = `<table class="trd-tbl">${head}${body}</table>`;
    // header click → sort
    document.querySelectorAll('#tableWrap thead th').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const k = th.dataset.k;
        if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        render(CURRENT);
      });
    });
  }

  function dmyToIso(s) {
    s = (s || '').trim(); if (!s) return '';
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }

  // normalize txn type: manual ใช้ BUY/SELL · auto ใช้ BUY/SEL/SUB/RED/SWI/SWO
  // filter เลือก BUY → match BUY/SUB/SWI (ซื้อ/เข้า) · เลือก SEL → match SEL/SELL/RED/SWO (ขาย/ออก)
  const BUYISH = { BUY: 1, SUB: 1, SWI: 1 }, SELLISH = { SEL: 1, SELL: 1, RED: 1, SWO: 1 };
  function txnMatch(filterVal, tType) {
    if (!filterVal) return true;
    const tt = (tType || '').toUpperCase();
    if (filterVal === 'BUY') return !!BUYISH[tt];
    if (filterVal === 'SEL') return !!SELLISH[tt];
    return tt === filterVal;   // SUB/RED/SWI/SWO เลือกตรงตัว
  }
  function isBuyish(tType) { return !!BUYISH[(tType || '').toUpperCase()]; }
  function applyFilter() {
    const q = document.getElementById('fSearch').value.trim().toLowerCase();
    const cls = document.getElementById('fClass').value;
    const sec = document.getElementById('fSec').value;
    const ty = document.getElementById('fTxnType').value;
    const fty = document.getElementById('fFundType') ? document.getElementById('fFundType').value : '';
    const ccy = document.getElementById('fCcy').value;
    const yr = fYear.value;
    const from = document.getElementById('fDateFrom').value;
    const to = document.getElementById('fDateTo').value;
    const list = TRADES().filter(t => {
      if (cls && t.asset_class !== cls) return false;
      if (sec && t.security !== sec) return false;
      if (ty && !txnMatch(ty, t.type)) return false;
      if (fty && (DL.typeOf(t.security) || '') !== fty) return false;
      if (ccy && (t.ccy || '') !== ccy) return false;
      if (yr && (t.iso_date || '').slice(0, 4) !== yr) return false;
      const iso = t.iso_date || '';
      if (from && iso && iso < from) return false;
      if (to && iso && iso > to) return false;
      if (q) { const hay = `${t.security} ${t.order_no} ${t.txn_id} ${t.exchange}`.toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
    render(list);
  }

  function exportExcel() {
    const rows = CURRENT.map(t => ({
      'วันที่': dmy(t.iso_date), 'ชนิด': clsLabel(t.asset_class), 'ประเภท': t.type,
      'หลักทรัพย์': t.security, 'ตลาด': t.exchange || '', 'จำนวนหน่วย': t.units, 'ราคา/หน่วย': t.price, 'สกุล': t.ccy,
      'Gross (USD)': t.gross_usd, 'Fee (USD)': t.fee_usd, 'Total (USD)': t.total_usd,
      'Gross (THB)': t.gross_thb, 'ค่าธรรมเนียม (THB)': t.fee_thb, 'มูลค่ารวม (THB)': t.total_thb,
      'FX THB/USD': t.fx_thb_usd, 'Order No': t.order_no, 'Txn ID': t.txn_id, 'ไฟล์ต้นฉบับ': t.source_file,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Trades');
    XLSX.writeFile(wb, `WealthMan_Trades_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function backupJSON() {
    const blob = new Blob([JSON.stringify(DL.payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `WealthMan_Backup_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJSON(ev) {
    const file = ev.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        const data = Array.isArray(obj) ? { trades: obj } : obj;
        if (!data.trades || !Array.isArray(data.trades)) throw new Error('ไม่พบ trades');
        DL.setPayload(data);
        alert('นำเข้าข้อมูลสำเร็จ: ' + data.trades.length + ' รายการ');
        DL.refreshAll();
      } catch (e) { alert('นำเข้าไม่สำเร็จ: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsText(file);
  }

  document.getElementById('fSearch').addEventListener('input', applyFilter);
  document.getElementById('fClass').addEventListener('change', () => { populateSec(); populateFundType(); applyFilter(); });
  document.getElementById('fFundType') && document.getElementById('fFundType').addEventListener('change', () => { populateSec(); applyFilter(); });
  document.getElementById('fSec').addEventListener('change', applyFilter);
  document.getElementById('fTxnType').addEventListener('change', () => { populateSec(); applyFilter(); });
  document.getElementById('fCcy').addEventListener('change', applyFilter);
  document.getElementById('fDateFrom').addEventListener('input', applyFilter);
  document.getElementById('fDateTo').addEventListener('input', applyFilter);
  fYear.addEventListener('change', applyFilter);
  document.getElementById('fClear').addEventListener('click', () => {
    ['fSearch','fClass','fSec','fTxnType','fCcy','fYear','fDateFrom','fDateTo'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    populateSec();
    applyFilter();
  });
  document.getElementById('btnExport').addEventListener('click', exportExcel);
  document.getElementById('btnBackup').addEventListener('click', backupJSON);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change', importJSON);

  // ===== Add manual transaction form =====
  const $ = id => document.getElementById(id);
  function fillFormDropdowns() {
    const am = $('mfAM'); if (am) am.innerHTML = '<option value="">—</option>' + DL.allAMs().map(a => `<option value="${a.id}">${a.name.replace(/</g,'&lt;')}</option>`).join('') + '<option value="__new">+ เพิ่มใหม่…</option>';
    
    const cl = $('mfClass'); if (cl) { const prev = cl.value; cl.innerHTML = DL.allClasses().map(c => `<option value="${c.key}">${c.label.replace(/</g,'&lt;')}</option>`).join(''); if (prev) cl.value = prev; }
  }
  function recomputeSellable() {
    const sec = ($('mfSec').value || '').trim();
    const ty = sec ? DL.typeOf(sec) : '';
    const eff = $('mfEffDate') ? $('mfEffDate').value : '';
    const txn = $('mfTxnDate').value;
    const base = eff || txn;   // ใช้วันมีผลก่อน ถ้าไม่มีใช้วันที่ทำรายการ
    const birth = (DL.loadProfile().birthdate) || '';
    const sellable = (ty && DL.typeIsSellable(ty)) ? DL.sellableDate(ty, base, birth) : '';
    const hint = $('mfSellableHint');
    if (!sec) { if (hint) hint.textContent = ''; return; }
    if (!ty) { if (hint) hint.textContent = 'ยังไม่ได้กำหนด type — ไปตั้งที่ Classify (แล้วคำนวณให้)'; return; }
    if (!DL.typeIsSellable(ty)) { $('mfSellable').value = ''; if (hint) hint.textContent = ty + ' — ขายได้เลย (ไม่มีเงื่อนไข)'; return; }
    if (base) { $('mfSellable').value = sellable || ''; if (hint) hint.textContent = sellable ? ('คำนวณจาก type: ' + ty + ' (แก้ได้)') : (/RMF/i.test(ty) && !birth ? 'ใส่วันเกิดใน Settings เพื่อคำนวณ RMF' : ''); }
    else if (hint) hint.textContent = '';
  }
  $('mfTxnDate') && $('mfTxnDate').addEventListener('change', recomputeSellable);
  $('mfEffDate') && $('mfEffDate').addEventListener('change', recomputeSellable);
  $('mfSec') && $('mfSec').addEventListener('input', recomputeSellable);
  $('mfAM') && $('mfAM').addEventListener('change', function () {
    if (this.value === '__new') { const n = (prompt('ชื่อ Asset Manager ใหม่:') || '').trim(); let id = ''; if (n) id = DL.amId(n, true, 'manual'); fillFormDropdowns(); this.value = id || ''; }
  });
  function openForm() { fillFormDropdowns(); $('addTrxCard').style.display = ''; $('addTrxCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  function closeForm() { $('addTrxCard').style.display = 'none'; ['mfSec','mfExch','mfUnits','mfPrice','mfTotalThb','mfTotalUsd','mfFeeThb','mfTxnDate','mfEffDate','mfSellable','mfOrder','mfNote'].forEach(id => { if ($(id)) $(id).value = ''; }); }
  $('btnAddTrx') && $('btnAddTrx').addEventListener('click', openForm);
  $('mfCancel') && $('mfCancel').addEventListener('click', closeForm);
  $('mfSave') && $('mfSave').addEventListener('click', () => {
    const sec = $('mfSec').value.trim();
    const txnDate = $('mfTxnDate').value;
    if (!sec) { alert('ใส่ชื่อหลักทรัพย์ก่อน'); return; }
    if (!txnDate) { alert('เลือกวันที่ทำรายการก่อน'); return; }
    const num = id => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
    const trx = {
      _mid: DL.genMid(), asset_class: $('mfClass').value, am_id: $('mfAM').value || '',
      type: $('mfType').value, security: sec, exchange: $('mfExch').value.trim(),
      fund_type: '', units: num('mfUnits'), price: num('mfPrice'),
      ccy: $('mfCcy').value, total_thb: num('mfTotalThb'), total_usd: num('mfTotalUsd'),
      fee_thb: num('mfFeeThb'), iso_date: txnDate, effective_date: $('mfEffDate').value || '',
      sellable_date: $('mfSellable').value || '', order_no: $('mfOrder').value.trim() || DL.genMid(),
      txn_id: $('mfOrder').value.trim() || ('MAN-' + sec), note: $('mfNote').value.trim(),
    };
    DL.addManual(trx); closeForm(); applyFilter(); DL.refreshAll && DL.refreshAll();
    alert('เพิ่มรายการแล้ว');
  });

  // ===== Import Excel (multi-row) =====
  function trxTemplate() {
    const rows = [{ asset_manager: 'Dime', asset_class: 'mutual_fund', type: 'SUB', security: 'ASP-RMF', exchange: '', fund_type: 'RMF', units: 100, price: 10, ccy: 'THB', total_thb: 1000, total_usd: '', fee_thb: 0, txn_date: '2026-01-15', effective_date: '', sellable_date: '', order_no: '', note: '' }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Transactions');
    XLSX.writeFile(wb, 'WealthMan_Trades_Template.xlsx');
  }
  function importXlsx(ev) {
    const file = ev.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb = XLSX.read(rd.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const cur = DL.loadManual(); let n = 0;
        const toIso = v => {
          if (v == null || v === '') return '';
          if (typeof v === 'number') { const dt = XLSX.SSF.parse_date_code(v); return dt ? `${dt.y}-${String(dt.m).padStart(2,'0')}-${String(dt.d).padStart(2,'0')}` : ''; }
          return String(v).trim().slice(0, 10);
        };
        rows.forEach(r => {
          const sec = String(r.security || '').trim(); if (!sec) return;
          const d = toIso(r.txn_date || r.iso_date);
          const eff = toIso(r.effective_date);
          const nz = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
          const amId = r.asset_manager ? DL.amId(String(r.asset_manager).trim(), true, 'manual') : '';
          const ft = r.fund_type || '';
          let sellable = toIso(r.sellable_date);
          if (!sellable && ft) { const birth = (DL.loadProfile() || {}).birthdate || ''; sellable = DL.sellableDate(ft, eff || d, birth) || ''; }
          cur.push({ _mid: DL.genMid(), asset_class: r.asset_class || 'other', am_id: amId, type: r.type || 'BUY', security: sec, exchange: r.exchange || '', fund_type: ft, units: nz(r.units), price: nz(r.price), ccy: r.ccy || 'THB', total_thb: nz(r.total_thb), total_usd: nz(r.total_usd), fee_thb: nz(r.fee_thb), iso_date: d, effective_date: eff, sellable_date: sellable, order_no: String(r.order_no || '') || DL.genMid(), txn_id: String(r.order_no || '') || ('MAN-' + sec), note: r.note || '' });
          n++;
        });
        DL.saveManual(cur); applyFilter(); DL.refreshAll && DL.refreshAll();
        alert('นำเข้า ' + n + ' รายการสำเร็จ');
      } catch (e) { alert('นำเข้าไม่สำเร็จ: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsArrayBuffer(file);
  }
  $('btnTrxTemplate') && $('btnTrxTemplate').addEventListener('click', trxTemplate);
  $('btnImportXlsx') && $('btnImportXlsx').addEventListener('click', () => $('fileImportXlsx').click());
  $('fileImportXlsx') && $('fileImportXlsx').addEventListener('change', importXlsx);

  // more-menu: close after clicking an item, and when clicking outside
  (function () {
    const dd = document.getElementById('trxMore'); if (!dd) return;
    dd.querySelectorAll('.moremenu-panel .btn').forEach(b => b.addEventListener('click', () => dd.removeAttribute('open')));
    document.addEventListener('click', e => { if (dd.open && !dd.contains(e.target)) dd.removeAttribute('open'); });
  })();

  applyFilter();
});
