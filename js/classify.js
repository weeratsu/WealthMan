/* DimeLog — Classify panel: assign a type to each security (saved in localStorage)
 * ระบบใส่ค่า default ให้จาก lookup ชนิดหลักทรัพย์จริง (DL.DEFAULT_TYPES) — ผู้ใช้แก้ทับได้
 * มี sorting (คลิกหัวคอลัมน์) + search + filter
 */
DL.register('classify', function (payload) {
  const trades = (DL.allTrades ? DL.allTrades() : (payload.trades || []));
  const clsLabel = DL.clsLabel;

  const info = {};
  trades.forEach(t => {
    const s = t.security || '-';
    (info[s] = info[s] || { assetCls: '', clsKey: '', n: 0, fundType: '' });
    info[s].assetCls = clsLabel(t.asset_class); info[s].clsKey = t.asset_class || ''; info[s].n++;
    if (t.fund_type && !info[s].fundType) info[s].fundType = t.fund_type;
  });
  const securities = Object.keys(info);

  // migrate อัตโนมัติ: security ที่ trx มี fund_type แต่ยังไม่ได้ตั้ง type (ผู้ใช้/default) → ตั้ง type = fund_type
  // map ค่า fund_type ย่อ/เพี้ยน → type มาตรฐาน (allTypes)
  const TYPE_ALIAS = { 'OPE': 'Open-End Fund', 'OPEN-END': 'Open-End Fund', 'OPENEND': 'Open-End Fund', 'TH STOCKS': 'Other', 'TH STOCK': 'Other', 'THAI STOCK': 'Other', 'ESG': 'Thai ESG', 'ESGX': 'Thai ESGX' };
  function canonType(v) {
    if (!v) return '';
    const valid = DL.allTypes ? DL.allTypes() : DL.SEC_TYPES;
    if (valid.indexOf(v) >= 0) return v;                 // ตรงอยู่แล้ว
    const a = TYPE_ALIAS[String(v).toUpperCase().trim()];
    return (a && valid.indexOf(a) >= 0) ? a : '';        // alias ที่รู้จัก · ไม่รู้จัก → ว่าง (ให้ผู้ใช้เลือกเอง)
  }
  (function migrateFundTypes() {
    // 1) ซ่อมค่าที่ค้างใน sec_types ให้เป็น type มาตรฐาน (เช่น OPE → Open-End Fund)
    const m = DL.loadTypes(); let fixed = false;
    Object.keys(m).forEach(k => { const cv = canonType(m[k]); if (cv !== m[k]) { if (cv) m[k] = cv; else delete m[k]; fixed = true; } });
    if (fixed) DL.saveTypes(m);
    // 2) migrate fund_type จาก trx → type (ผ่าน canon) สำหรับ security ที่ยังไม่ได้ตั้งเอง
    securities.forEach(s => {
      if (DL.userTypeOf(s)) return;
      const cv = canonType(info[s].fundType);
      if (cv) DL.setType(s, cv);
    });
  })();

  const body = document.getElementById('clsBody');
  const countEl = document.getElementById('clsCount');
  const searchEl = document.getElementById('clsSearch');
  const filterEl = document.getElementById('clsFilter');
  const clsEl = document.getElementById('clsClass');
  const typeEl = document.getElementById('clsType');

  let sortCol = 'sec', sortDir = 1;  // default A→Z by security

  function optionsHtml(sel) {
    const types = DL.allTypes ? DL.allTypes() : DL.SEC_TYPES;
    return '<option value="">— ยังไม่กำหนด —</option>' +
      types.map(t => `<option value="${t}"${t === sel ? ' selected' : ''}>${t}</option>`).join('');
  }

  function rowsData() {
    return securities.map(s => ({
      sec: s, cls: info[s].assetCls, clsKey: info[s].clsKey, n: info[s].n,
      type: DL.typeOf(s),                 // effective (user > default)
      isDefault: !DL.userTypeOf(s) && !!DL.typeOf(s),  // showing a system default (not user-set)
    }));
  }

  function render() {
    const q = (searchEl.value || '').trim().toLowerCase();
    const f = filterEl.value;
    const fc = clsEl ? clsEl.value : '', ft = typeEl ? typeEl.value : '';
    let list = rowsData().filter(r => {
      if (q && !r.sec.toLowerCase().includes(q)) return false;
      if (fc && r.clsKey !== fc) return false;
      if (ft && r.type !== ft) return false;
      if (f === 'unset' && r.type) return false;       // No type at all
      if (f === 'set' && !r.type) return false;        // Has a type (auto or confirmed)
      if (f === 'auto' && !r.isDefault) return false;  // System-derived, not user-confirmed
      return true;
    });
    const dir = sortDir;
    list.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'n') return (va - vb) * dir;
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    countEl.textContent = `${list.length} หลักทรัพย์`;
    body.innerHTML = list.map(r => {
      const tag = r.isDefault ? ' <span style="font-size:10px;color:var(--muted)">(auto)</span>' : '';
      return `<tr><td class="yr">${r.sec}</td>` +
        `<td style="text-align:left;font-family:var(--font)">${r.cls}</td>` +
        `<td>${r.n}</td>` +
        `<td style="text-align:left"><select data-sec="${r.sec.replace(/"/g, '&quot;')}" class="cls-sel">${optionsHtml(r.type)}</select>${tag}</td></tr>`;
    }).join('');
    body.querySelectorAll('select.cls-sel').forEach(sel => {
      sel.addEventListener('change', () => { DL.setType(sel.getAttribute('data-sec'), sel.value); render(); });
    });
  }

  // sortable headers
  const headerMap = ['sec', 'cls', 'n', 'type'];
  const thead = document.querySelector('#clsTable thead tr');
  if (thead && !thead.dataset.sortable) {
    thead.dataset.sortable = '1';
    [...thead.children].forEach((th, i) => {
      th.style.cursor = 'pointer'; th.title = 'คลิกเพื่อเรียง';
      th.addEventListener('click', () => {
        const col = headerMap[i];
        if (sortCol === col) sortDir = -sortDir; else { sortCol = col; sortDir = 1; }
        render();
      });
    });
  }

  function buildClassDd() {
    if (!clsEl) return;
    const cur = clsEl.value;
    const classes = [...new Set(securities.map(s => info[s].clsKey).filter(Boolean))].sort();
    clsEl.innerHTML = '<option value="">All classes</option>' + classes.map(k => `<option value="${k}">${clsLabel(k)}</option>`).join('');
    if (cur && classes.includes(cur)) clsEl.value = cur;
  }
  function buildTypeDd() {
    if (!typeEl) return;
    const cur = typeEl.value, fc = clsEl ? clsEl.value : '';
    const types = [...new Set(securities.filter(s => !fc || info[s].clsKey === fc).map(s => DL.typeOf(s)).filter(Boolean))].sort();
    typeEl.innerHTML = '<option value="">All types</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
    if (cur && types.includes(cur)) typeEl.value = cur;
  }
  buildClassDd(); buildTypeDd();

  searchEl.oninput = render;
  filterEl.onchange = render;
  if (clsEl) clsEl.onchange = () => { buildTypeDd(); render(); };
  if (typeEl) typeEl.onchange = render;

  document.getElementById('btnClsExport').onclick = function () {
    const blob = new Blob([JSON.stringify(DL.loadTypes(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `WealthMan_SecTypes_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('btnClsImport').onclick = () => document.getElementById('clsImportFile').click();
  document.getElementById('clsImportFile').onchange = function (ev) {
    const file = ev.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
        DL.saveTypes(obj); render();
        alert('นำเข้าประเภทสำเร็จ: ' + Object.keys(obj).length + ' รายการ');
      } catch (e) { alert('นำเข้าไม่สำเร็จ: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsText(file);
  };

  render();
});
