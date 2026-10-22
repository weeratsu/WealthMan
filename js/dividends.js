/* WealthMan — Dividends panel: บันทึกเงินปันผล (USD หุ้นต่างประเทศ + THB กองทุนไทย)
 * ข้อมูลหลักจาก window.INV_DIVIDENDS + รายการที่ import เพิ่มเก็บใน localStorage (dimelog_dividends_import)
 * รองรับ 2 สกุล (ccy = USD/THB) — ไม่แปลงข้ามสกุลตอนเก็บ · รวมยอดเป็นบาทด้วย FX สำหรับ KPI/เทียบ
 */
DL.register('dividends', function (payload) {
  const fmt = DL.fmt, money = DL.money, dmy = DL.dmy;
  const IMPORT_KEY = 'dimelog_dividends_import';
  const DELETED_KEY = 'dimelog_dividends_deleted';
  function loadDeleted() { try { return JSON.parse(localStorage.getItem(DELETED_KEY) || '[]') || []; } catch (e) { return []; } }
  function saveDeleted(a) { try { localStorage.setItem(DELETED_KEY, JSON.stringify(a || [])); } catch (e) {} }
  function keyOf(r) { return (r.security || '') + '|' + (r.pay_date || ''); }

  // schema (Excel template) — เพิ่ม ccy · amount เป็นตัวเลขสกุลตาม ccy
  const FIELDS = ['security', 'pay_date', 'ccy', 'gross', 'wht', 'fee', 'per_share', 'record_date', 'effective_date', 'note'];

  function baseRows() {
    const dd = (window.INV_DIVIDENDS && window.INV_DIVIDENDS.dividends) || [];
    return dd.slice();
  }
  function importedRows() {
    try { return JSON.parse(localStorage.getItem(IMPORT_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function saveImported(rows) { try { localStorage.setItem(IMPORT_KEY, JSON.stringify(rows || [])); } catch (e) {} }

  function allRows() {
    const map = {};
    baseRows().forEach(d => { map[(d.security || '') + '|' + (d.pay_date || '')] = norm(d); });
    importedRows().forEach(d => { map[(d.security || '') + '|' + (d.pay_date || '')] = norm(d); });
    const del = loadDeleted();
    del.forEach(k => { delete map[k]; });
    return Object.values(map);
  }
  // รองรับทั้ง field ใหม่ (gross/wht/fee + ccy) และเก่า (gross_usd/wht_usd/fee_usd = USD)
  function pick(d, nw, old) { const v = d[nw] != null && d[nw] !== '' ? d[nw] : d[old]; return v; }
  function norm(d) {
    const ccy = (d.ccy || 'USD').toString().toUpperCase() === 'THB' ? 'THB' : 'USD';
    const gRaw = pick(d, 'gross', 'gross_usd'), wRaw = pick(d, 'wht', 'wht_usd'), fRaw = pick(d, 'fee', 'fee_usd');
    const g = +gRaw || 0;
    const w = (wRaw == null || wRaw === '') ? null : (+wRaw || 0);
    const f = (fRaw == null || fRaw === '') ? null : (+fRaw || 0);
    const net = +(g - (w || 0) - (f || 0)).toFixed(4);
    return {
      security: d.security || '', pay_date: d.pay_date || '', ccy: ccy,
      gross: g, wht: w, fee: f, net: net,
      per_share: d.per_share == null || d.per_share === '' ? null : +d.per_share,
      record_date: d.record_date || '', effective_date: d.effective_date || '', note: d.note || '',
    };
  }
  // แปลงเป็นบาท (ตามวันจ่าย) — USD ใช้ FX, THB คงเดิม
  function toThb(v, r) { if (v == null) return null; return r.ccy === 'THB' ? v : DL.usdToThb(v, r.pay_date); }

  let ROWS = allRows();
  let sortCol = 'pay_date', sortDir = -1;

  const kpiEl = document.getElementById('divKpis');
  const body = document.getElementById('divBody');
  const countEl = document.getElementById('divCount');
  const searchEl = document.getElementById('divSearch');
  const secEl = document.getElementById('divSec');
  const yearEl = document.getElementById('divYear');
  const ccyEl = document.getElementById('divCcy');
  const clsEl = document.getElementById('divClass');
  const typeEl = document.getElementById('divType');
  // security → asset_class map (ปันผลไม่มี asset_class ในตัว ต้อง lookup จาก trades)
  const SECCLS = {};
  (DL.allTrades ? DL.allTrades() : []).forEach(t => { if (t.security && !SECCLS[t.security]) SECCLS[t.security] = t.asset_class; });
  function secClass(sym) { return SECCLS[sym] || ''; }

  function divSecs() { return [...new Set(ROWS.map(r => r.security).filter(s => s && s !== '(TAF Fee)'))]; }
  function buildFilters() {
    if (clsEl) {
      const cur = clsEl.value;
      const classes = [...new Set(divSecs().map(secClass).filter(Boolean))].sort();
      clsEl.innerHTML = '<option value="">All classes</option>' + classes.map(c => `<option value="${c}">${DL.clsLabel(c)}</option>`).join('');
      if (cur && classes.includes(cur)) clsEl.value = cur;
    }
    if (typeEl) {
      const cur = typeEl.value, fc = clsEl ? clsEl.value : '';
      const types = [...new Set(divSecs().filter(s => !fc || secClass(s) === fc).map(s => DL.typeOf(s)).filter(Boolean))].sort();
      typeEl.innerHTML = '<option value="">All types</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
      if (cur && types.includes(cur)) typeEl.value = cur;
    }
    if (secEl) {
      const cur = secEl.value, fc = clsEl ? clsEl.value : '', ft = typeEl ? typeEl.value : '';
      const syms = divSecs().filter(s => (!fc || secClass(s) === fc) && (!ft || (DL.typeOf(s) || '') === ft)).sort();
      secEl.innerHTML = '<option value="">All securities</option>' + syms.map(s => `<option value="${s}">${s}</option>`).join('');
      if (cur && syms.includes(cur)) secEl.value = cur;
    }
    if (yearEl) {
      const cur = yearEl.value;
      yearEl.innerHTML = '<option value="">All years</option>' +
        [...new Set(ROWS.map(r => (r.pay_date || '').slice(0, 4)).filter(Boolean))].sort()
          .map(y => `<option value="${y}">${y}</option>`).join('');
      yearEl.value = cur;
    }
    if (ccyEl) {
      const cur = ccyEl.value;
      const ccys = [...new Set(ROWS.map(r => r.ccy).filter(Boolean))].sort();
      ccyEl.innerHTML = '<option value="">All currencies</option>' + ccys.map(c => `<option value="${c}">${c}</option>`).join('');
      ccyEl.value = cur;
    }
  }

  function current() {
    const q = (searchEl.value || '').trim().toLowerCase();
    const fs = secEl.value, fy = yearEl.value, fc = ccyEl ? ccyEl.value : '';
    const fcl = clsEl ? clsEl.value : '', ft = typeEl ? typeEl.value : '';
    let list = ROWS.filter(r => {
      if (r.security === '(TAF Fee)') return false;
      if (q && !r.security.toLowerCase().includes(q)) return false;
      if (fcl && secClass(r.security) !== fcl) return false;
      if (ft && (DL.typeOf(r.security) || '') !== ft) return false;
      if (fs && r.security !== fs) return false;
      if (fy && (r.pay_date || '').slice(0, 4) !== fy) return false;
      if (fc && r.ccy !== fc) return false;
      return true;
    });
    const dir = sortDir;
    list.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'gross' || sortCol === 'wht' || sortCol === 'net' || sortCol === 'per_share')
        return ((va || 0) - (vb || 0)) * dir;
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return list;
  }

  function kpis(list) {
    // รวมแยกสกุล + รวมเป็นบาท
    let gUsd = 0, nUsd = 0, gThb = 0, nThb = 0, allNetThb = 0;
    list.forEach(r => {
      if (r.ccy === 'THB') { gThb += r.gross || 0; nThb += r.net || 0; }
      else { gUsd += r.gross || 0; nUsd += r.net || 0; }
      allNetThb += (toThb(r.net, r) || 0);
    });
    const nsym = new Set(list.map(r => r.security)).size;
    const card = (label, val, unit, note) => `<div class="kpi"><div class="label">${label}</div><div class="value">${val}${unit ? ` <span class="unit">${unit}</span>` : ''}</div>${note ? `<div class="kpi-note">${note}</div>` : ''}</div>`;
    const parts = [];
    if (gUsd) parts.push(card('ปันผลรวม (USD)', money(gUsd, 2), 'USD'));
    if (gThb) parts.push(card('ปันผลรวม (THB)', money(gThb, 2), 'THB'));
    parts.push(card('ปันผลสุทธิ รวมเป็นบาท', money(allNetThb, 0), 'THB', 'USD แปลงด้วย FX ตามวันจ่าย'));
    parts.push(card('หลักทรัพย์จ่ายปันผล', nsym, 'ตัว'));
    kpiEl.innerHTML = parts.join('');
  }

  function render() {
    const list = current();
    kpis(list);
    countEl.textContent = `${list.length} รายการ`;
    body.innerHTML = list.map(r => {
      const netThb = r.ccy === 'USD' ? toThb(r.net, r) : null;
      const sfx = (netThb != null) ? ` <span style="color:var(--muted);font-size:11px">${DL.isPrivate() ? '(≈฿•••)' : '(≈฿' + fmt(netThb, 0) + ')'}</span>` : '';
      return `<tr>
      <td class="yr">${dmy(r.pay_date)}</td>
      <td style="text-align:left">${r.security}</td>
      <td><span class="chip" style="font-size:11px">${r.ccy}</span></td>
      <td>${r.per_share != null ? fmt(r.per_share, 6) : '—'}</td>
      <td style="color:var(--success)">${money(r.gross, 2)}</td>
      <td>${r.wht != null ? '−' + money(r.wht, 2) : '—'}</td>
      <td><b>${money(r.net, 2)}</b>${sfx}</td>
      <td style="font-family:var(--font)">${r.record_date ? dmy(r.record_date) : '—'}</td>
      <td style="font-family:var(--font)">${r.effective_date ? dmy(r.effective_date) : '—'}</td>
      <td style="white-space:nowrap"><button class="btn secondary" data-edit="${keyOf(r)}" style="padding:1px 7px;font-size:12px">✏️</button> <button class="btn secondary" data-del="${keyOf(r)}" style="padding:1px 7px;font-size:12px">🗑️</button></td>
    </tr>`;
    }).join('');
    // wire action buttons
    body.querySelectorAll('button[data-del]').forEach(btn => btn.addEventListener('click', () => onDelete(btn.dataset.del)));
    body.querySelectorAll('button[data-edit]').forEach(btn => btn.addEventListener('click', () => onEdit(btn.dataset.edit)));
  }

  const headerMap = ['pay_date', 'security', 'ccy', 'per_share', 'gross', 'wht', 'net', 'record_date', 'effective_date'];
  const thead = document.querySelector('#divTable thead tr');
  if (thead && !thead.dataset.sortable) {
    thead.dataset.sortable = '1';
    [...thead.children].forEach((th, i) => {
      th.style.cursor = 'pointer'; th.title = 'คลิกเพื่อเรียง';
      th.addEventListener('click', () => {
        const col = headerMap[i]; if (!col) return;
        if (sortCol === col) sortDir = -sortDir; else { sortCol = col; sortDir = col === 'security' ? 1 : -1; }
        render();
      });
    });
  }

  searchEl.oninput = render;
  secEl.onchange = render;
  yearEl.onchange = render;
  if (ccyEl) ccyEl.onchange = render;
  if (clsEl) clsEl.onchange = () => { buildFilters(); render(); };
  if (typeEl) typeEl.onchange = () => { buildFilters(); render(); };

  // ---- Export Excel (current view) ----
  document.getElementById('btnDivExport').onclick = function () {
    const rows = current().map(r => ({
      'วันที่จ่าย': dmy(r.pay_date), 'หลักทรัพย์': r.security, 'สกุล': r.ccy, 'ต่อหน่วย': r.per_share,
      'ปันผล': r.gross, 'ภาษีหัก': r.wht, 'สุทธิ': r.net,
      'สุทธิ(฿)': r.ccy === 'USD' ? toThb(r.net, r) : r.net,
      'Record date': r.record_date ? dmy(r.record_date) : '', 'วันมีผล': r.effective_date ? dmy(r.effective_date) : '', 'หมายเหตุ': r.note || '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Dividends');
    XLSX.writeFile(wb, `WealthMan_Dividends_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ---- Download blank Import template ----
  document.getElementById('btnDivTemplate').onclick = function () {
    const sample = [
      { security: 'JEPQ', pay_date: '2026-10-05', ccy: 'USD', gross: 5.2, wht: 0.78, fee: '', per_share: 0.63, record_date: '2026-10-01', effective_date: '', note: '' },
      { security: 'K-USA-A(D)', pay_date: '2026-10-15', ccy: 'THB', gross: 120, wht: '', fee: '', per_share: 0.25, record_date: '2026-09-30', effective_date: '', note: 'ปันผลกองทุนไทย' },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sample, { header: FIELDS });
    XLSX.utils.book_append_sheet(wb, ws, 'Dividends');
    XLSX.writeFile(wb, 'WealthMan_Dividends_Template.xlsx');
  };

  // ---- Import filled template ----
  document.getElementById('btnDivImport').onclick = () => document.getElementById('divImportFile').click();
  document.getElementById('divImportFile').onchange = function (ev) {
    const file = ev.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb = XLSX.read(rd.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        let rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const toIso = v => {
          if (v == null || v === '') return '';
          if (typeof v === 'number') { const dt = XLSX.SSF.parse_date_code(v); return dt ? `${dt.y}-${String(dt.m).padStart(2,'0')}-${String(dt.d).padStart(2,'0')}` : ''; }
          const s = String(v).trim();
          const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);  // dd/mm/yyyy
          if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
          return s.slice(0, 10);
        };
        rows = rows.map(r => ({ ...r, pay_date: toIso(r.pay_date) })).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.pay_date));
        if (!rows.length) throw new Error('ไม่พบแถวข้อมูลที่ถูกต้อง (ต้องมีคอลัมน์ pay_date ที่เป็นวันที่)');
        const cleaned = rows.map(r => {
          const ccy = (r.ccy || 'USD').toString().toUpperCase() === 'THB' ? 'THB' : 'USD';
          const g = pickRaw(r, 'gross', 'gross_usd'), w = pickRaw(r, 'wht', 'wht_usd'), f = pickRaw(r, 'fee', 'fee_usd');
          return {
            security: (r.security || '').toString().trim(),
            pay_date: r.pay_date, ccy: ccy,
            gross: +g || 0,
            wht: w === '' || w == null ? null : +w,
            fee: f === '' || f == null ? null : +f,
            per_share: r.per_share === '' || r.per_share == null ? null : +r.per_share,
            record_date: toIso(r.record_date),
            effective_date: toIso(r.effective_date),
            note: (r.note || '').toString().trim(),
          };
        });
        const existing = importedRows();
        const map = {};
        existing.concat(cleaned).forEach(d => { map[d.security + '|' + d.pay_date] = d; });
        saveImported(Object.values(map));
        ROWS = allRows(); buildFilters(); render();
        alert('นำเข้าปันผลสำเร็จ: ' + cleaned.length + ' รายการ (รวมในระบบ ' + ROWS.filter(r => r.security !== '(TAF Fee)').length + ' รายการ)');
      } catch (e) { alert('นำเข้าไม่สำเร็จ: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsBinaryString(file);
  };
  function pickRaw(r, nw, old) { const v = (r[nw] != null && r[nw] !== '') ? r[nw] : r[old]; return v; }

  // ---- Delete a record (imported → remove; base → soft-delete) ----
  function onDelete(k) {
    if (!confirm('ลบรายการปันผลนี้?')) return;
    const imp = importedRows().filter(d => keyOf(norm(d)) !== k);
    if (imp.length !== importedRows().length) { saveImported(imp); }
    else { const del = loadDeleted(); if (!del.includes(k)) { del.push(k); saveDeleted(del); } }
    ROWS = allRows(); buildFilters(); render();
  }
  // ---- Edit a record (opens inline prompt form via a small modal) ----
  function onEdit(k) {
    const r = ROWS.find(x => keyOf(x) === k); if (!r) return;
    const nd = editModal(r);
    if (!nd) return;
    // remove old key from imported + deleted, add new as imported override
    const imp = importedRows().filter(d => keyOf(norm(d)) !== k);
    imp.push(nd);
    saveImported(imp);
    // if it was previously soft-deleted, undelete
    const del = loadDeleted().filter(x => x !== k && x !== keyOf(nd)); saveDeleted(del);
    ROWS = allRows(); buildFilters(); render();
  }
  // minimal edit modal (reuses browser prompt for each field — simple + reliable)
  function editModal(r) {
    const sec = prompt('หลักทรัพย์', r.security); if (sec == null) return null;
    const pay = prompt('วันจ่าย (yyyy-mm-dd)', r.pay_date); if (pay == null) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pay.trim())) { alert('วันจ่ายต้องเป็น yyyy-mm-dd'); return null; }
    const ccy = (prompt('สกุล (USD/THB)', r.ccy) || 'USD').toUpperCase() === 'THB' ? 'THB' : 'USD';
    const gross = prompt('ปันผล (ตามสกุล)', r.gross != null ? r.gross : ''); if (gross == null) return null;
    const wht = prompt('ภาษีหัก (ว่างได้)', r.wht != null ? r.wht : '');
    const fee = prompt('ค่าธรรมเนียม (ว่างได้)', r.fee != null ? r.fee : '');
    const ps = prompt('ต่อหน่วย (ว่างได้)', r.per_share != null ? r.per_share : '');
    const rec = prompt('record date yyyy-mm-dd (ว่างได้)', r.record_date || '');
    const eff = prompt('วันมีผล yyyy-mm-dd (ว่างได้)', r.effective_date || '');
    const note = prompt('หมายเหตุ (ว่างได้)', r.note || '');
    return {
      security: sec.trim(), pay_date: pay.trim(), ccy: ccy,
      gross: +gross || 0,
      wht: wht === '' || wht == null ? null : +wht,
      fee: fee === '' || fee == null ? null : +fee,
      per_share: ps === '' || ps == null ? null : +ps,
      record_date: (rec || '').trim(), effective_date: (eff || '').trim(), note: (note || '').trim(),
    };
  }

  buildFilters();
  render();
});
