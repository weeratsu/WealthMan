/* DimeLog — Classify panel: assign a type to each security (saved in localStorage)
 * ระบบใส่ค่า default ให้จาก lookup ชนิดหลักทรัพย์จริง (DL.DEFAULT_TYPES) — ผู้ใช้แก้ทับได้
 * มี sorting (คลิกหัวคอลัมน์) + search + filter
 */
DL.register('classify', function (payload) {
  const trades = (payload.trades || []);
  const clsLabel = DL.clsLabel;

  const info = {};
  trades.forEach(t => {
    const s = t.security || '-';
    (info[s] = info[s] || { assetCls: '', n: 0 });
    info[s].assetCls = clsLabel(t.asset_class); info[s].n++;
  });
  const securities = Object.keys(info);

  const body = document.getElementById('clsBody');
  const countEl = document.getElementById('clsCount');
  const searchEl = document.getElementById('clsSearch');
  const filterEl = document.getElementById('clsFilter');

  let sortCol = 'sec', sortDir = 1;  // default A→Z by security

  function optionsHtml(sel) {
    return '<option value="">— ยังไม่กำหนด —</option>' +
      DL.SEC_TYPES.map(t => `<option value="${t}"${t === sel ? ' selected' : ''}>${t}</option>`).join('');
  }

  function rowsData() {
    return securities.map(s => ({
      sec: s, cls: info[s].assetCls, n: info[s].n,
      type: DL.typeOf(s),                 // effective (user > default)
      isDefault: !DL.userTypeOf(s) && !!DL.typeOf(s),  // showing a system default (not user-set)
    }));
  }

  function render() {
    const q = (searchEl.value || '').trim().toLowerCase();
    const f = filterEl.value;
    let list = rowsData().filter(r => {
      if (q && !r.sec.toLowerCase().includes(q)) return false;
      if (f === 'unset' && r.type) return false;         // ยังไม่มีประเภท (รวม default ว่าง)
      if (f === 'default' && !r.isDefault) return false; // เฉพาะที่ยังเป็นค่า default ระบบ
      if (f && f !== 'unset' && f !== 'default' && r.type !== f) return false;  // กรองตามประเภท
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

  searchEl.oninput = render;
  filterEl.onchange = render;

  // ensure filter dropdown has type options (built once)
  if (!filterEl.dataset.built) {
    filterEl.dataset.built = '1';
    filterEl.innerHTML = '<option value="">ทั้งหมด</option>' +
      '<option value="unset">ยังไม่กำหนด</option>' +
      '<option value="default">ค่าอัตโนมัติ (auto)</option>' +
      DL.SEC_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  document.getElementById('btnClsExport').onclick = function () {
    const blob = new Blob([JSON.stringify(DL.loadTypes(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `Dime_SecTypes_${new Date().toISOString().slice(0, 10)}.json`; a.click();
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
