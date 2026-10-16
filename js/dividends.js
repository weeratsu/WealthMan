/* DimeLog — Dividends panel: บันทึกเงินปันผล (จาก OCR / Import Excel)
 * ข้อมูลหลักจาก window.INV_DIVIDENDS + รายการที่ import เพิ่มเก็บใน localStorage (dimelog_dividends_import)
 * มี KPI + ตารางเรียง/กรอง + Export Excel + Import Excel template (ไม่พึ่ง OCR/Python/agent)
 * ปันผลเป็น USD — แปลง THB ด้วย FX เฉลี่ยจากหน้า trades (ถ้ามี) ไว้ประเมินคร่าว ๆ
 */
DL.register('dividends', function (payload) {
  const fmt = DL.fmt, money = DL.money, dmy = DL.dmy;
  const IMPORT_KEY = 'dimelog_dividends_import';

  // คอลัมน์ schema (ใช้ร่วมกับ Excel template)
  const FIELDS = ['security', 'pay_date', 'gross_usd', 'wht_usd', 'fee_usd', 'per_share', 'record_date', 'note'];

  function baseRows() {
    const dd = (window.INV_DIVIDENDS && window.INV_DIVIDENDS.dividends) || [];
    return dd.slice();
  }
  function importedRows() {
    try { return JSON.parse(localStorage.getItem(IMPORT_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function saveImported(rows) { try { localStorage.setItem(IMPORT_KEY, JSON.stringify(rows || [])); } catch (e) {} }

  function allRows() {
    // รวม base + imported, dedup ด้วย security+pay_date (imported ทับ base)
    const map = {};
    baseRows().forEach(d => { map[(d.security || '') + '|' + (d.pay_date || '')] = norm(d); });
    importedRows().forEach(d => { map[(d.security || '') + '|' + (d.pay_date || '')] = norm(d); });
    return Object.values(map);
  }
  function norm(d) {
    const g = +d.gross_usd || 0, w = +d.wht_usd || 0, f = +d.fee_usd || 0;
    return {
      security: d.security || '', pay_date: d.pay_date || '',
      gross_usd: g, wht_usd: d.wht_usd == null || d.wht_usd === '' ? null : w,
      fee_usd: d.fee_usd == null || d.fee_usd === '' ? null : f,
      net_usd: +(g - w - f).toFixed(4),
      per_share: d.per_share == null || d.per_share === '' ? null : +d.per_share,
      record_date: d.record_date || '', note: d.note || '', ccy: 'USD',
    };
  }

  let ROWS = allRows();
  let sortCol = 'pay_date', sortDir = -1;  // ล่าสุดก่อน

  const kpiEl = document.getElementById('divKpis');
  const body = document.getElementById('divBody');
  const countEl = document.getElementById('divCount');
  const searchEl = document.getElementById('divSearch');
  const secEl = document.getElementById('divSec');
  const yearEl = document.getElementById('divYear');

  // populate security + year filters
  function buildFilters() {
    if (secEl) {
      const cur = secEl.value;
      secEl.innerHTML = '<option value="">All securities</option>' +
        [...new Set(ROWS.map(r => r.security).filter(s => s && s !== '(TAF Fee)'))].sort()
          .map(s => `<option value="${s}">${s}</option>`).join('');
      secEl.value = cur;
    }
    if (yearEl) {
      const cur = yearEl.value;
      yearEl.innerHTML = '<option value="">All years</option>' +
        [...new Set(ROWS.map(r => (r.pay_date || '').slice(0, 4)).filter(Boolean))].sort()
          .map(y => `<option value="${y}">${y}</option>`).join('');
      yearEl.value = cur;
    }
  }

  function current() {
    const q = (searchEl.value || '').trim().toLowerCase();
    const fs = secEl.value, fy = yearEl.value;
    let list = ROWS.filter(r => {
      if (r.security === '(TAF Fee)') return false;   // ไม่โชว์ TAF fee ในตารางปันผลหลัก
      if (q && !r.security.toLowerCase().includes(q)) return false;
      if (fs && r.security !== fs) return false;
      if (fy && (r.pay_date || '').slice(0, 4) !== fy) return false;
      return true;
    });
    const dir = sortDir;
    list.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'gross_usd' || sortCol === 'wht_usd' || sortCol === 'net_usd' || sortCol === 'per_share')
        return ((va || 0) - (vb || 0)) * dir;
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return list;
  }

  function kpis(list) {
    const g = list.reduce((s, r) => s + (r.gross_usd || 0), 0);
    const w = list.reduce((s, r) => s + (r.wht_usd || 0), 0);
    const n = list.reduce((s, r) => s + (r.net_usd || 0), 0);
    const nsym = new Set(list.map(r => r.security)).size;
    const card = (label, val, unit) => `<div class="kpi"><div class="label">${label}</div><div class="value">${val}${unit ? ` <span class="unit">${unit}</span>` : ''}</div></div>`;
    kpiEl.innerHTML =
      card('เงินปันผลรวม', money(g, 2), 'USD') +
      card('ภาษีหัก ณ ที่จ่าย', money(w, 2), 'USD') +
      card('ปันผลสุทธิ', money(n, 2), 'USD') +
      card('หลักทรัพย์จ่ายปันผล', nsym, 'ตัว');
  }

  function render() {
    const list = current();
    kpis(list);
    countEl.textContent = `${list.length} รายการ`;
    body.innerHTML = list.map(r => `<tr>
      <td class="yr">${dmy(r.pay_date)}</td>
      <td style="text-align:left">${r.security}</td>
      <td>${r.per_share != null ? fmt(r.per_share, 6) : '—'}</td>
      <td style="color:var(--success)">${money(r.gross_usd, 2)}</td>
      <td>${r.wht_usd != null ? '−' + money(r.wht_usd, 2) : '—'}</td>
      <td><b>${money(r.net_usd, 2)}</b></td>
      <td style="font-family:var(--font)">${r.record_date ? dmy(r.record_date) : '—'}</td>
    </tr>`).join('');
  }

  // sortable headers
  const headerMap = ['pay_date', 'security', 'per_share', 'gross_usd', 'wht_usd', 'net_usd', 'record_date'];
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

  // ---- Export Excel (current view) ----
  document.getElementById('btnDivExport').onclick = function () {
    const rows = current().map(r => ({
      'วันที่จ่าย': dmy(r.pay_date), 'หลักทรัพย์': r.security, 'ต่อหน่วย (USD)': r.per_share,
      'ปันผล (USD)': r.gross_usd, 'ภาษีหัก (USD)': r.wht_usd, 'สุทธิ (USD)': r.net_usd,
      'Record date': r.record_date ? dmy(r.record_date) : '', 'หมายเหตุ': r.note || '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Dividends');
    XLSX.writeFile(wb, `Dime_Dividends_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ---- Download blank Import template ----
  document.getElementById('btnDivTemplate').onclick = function () {
    const sample = [{
      security: 'JEPQ', pay_date: '2026-10-05', gross_usd: 5.2, wht_usd: 0.78,
      fee_usd: '', per_share: 0.63, record_date: '2026-10-01', note: '',
    }, {
      security: 'O', pay_date: '2026-10-15', gross_usd: 2.1, wht_usd: 0.31,
      fee_usd: '', per_share: 0.271, record_date: '2026-09-30', note: '',
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sample, { header: FIELDS });
    // แถวอธิบายหัวคอลัมน์
    XLSX.utils.sheet_add_aoa(ws, [[
      'ชื่อหลักทรัพย์', 'วันจ่าย yyyy-mm-dd', 'ปันผล USD', 'ภาษีหัก USD (ว่างได้)',
      'ค่าธรรมเนียม USD (ว่างได้)', 'ต่อหน่วย (ว่างได้)', 'record date yyyy-mm-dd (ว่างได้)', 'หมายเหตุ',
    ]], { origin: 'A1' });
    XLSX.utils.sheet_add_json(ws, sample, { header: FIELDS, skipHeader: true, origin: 'A2' });
    XLSX.utils.book_append_sheet(wb, ws, 'Dividends');
    XLSX.writeFile(wb, 'Dime_Dividends_Template.xlsx');
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
        // ข้ามแถวอธิบาย (ถ้า pay_date ไม่ใช่รูปแบบวันที่)
        rows = rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test((r.pay_date || '').toString().trim()));
        if (!rows.length) throw new Error('ไม่พบแถวข้อมูลที่ถูกต้อง (pay_date ต้องเป็น yyyy-mm-dd)');
        const cleaned = rows.map(r => ({
          security: (r.security || '').toString().trim(),
          pay_date: (r.pay_date || '').toString().trim(),
          gross_usd: +r.gross_usd || 0,
          wht_usd: r.wht_usd === '' || r.wht_usd == null ? null : +r.wht_usd,
          fee_usd: r.fee_usd === '' || r.fee_usd == null ? null : +r.fee_usd,
          per_share: r.per_share === '' || r.per_share == null ? null : +r.per_share,
          record_date: (r.record_date || '').toString().trim(),
          note: (r.note || '').toString().trim(),
        }));
        // merge กับ imported เดิม (dedup security+pay_date)
        const existing = importedRows();
        const map = {};
        existing.concat(cleaned).forEach(d => { map[d.security + '|' + d.pay_date] = d; });
        const merged = Object.values(map);
        saveImported(merged);
        ROWS = allRows(); buildFilters(); render();
        alert('นำเข้าปันผลสำเร็จ: ' + cleaned.length + ' รายการ (รวมในระบบ ' + ROWS.filter(r=>r.security!=='(TAF Fee)').length + ' รายการ)');
      } catch (e) { alert('นำเข้าไม่สำเร็จ: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsBinaryString(file);
  };

  buildFilters();
  render();
});
