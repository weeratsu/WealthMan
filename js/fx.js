/* WealthMan — FX Rates panel (USD→THB รายวัน)
   seed จาก data/fx.js (window.INV_FX.rates) + ผู้ใช้กรอก/Import ทับใน localStorage (dimelog_fx)
   ใช้แปลงรายการสกุล USD ที่ไม่มีเรทในตัว — ระบบเลือกเรท "วันใกล้สุด" (ดู DL.fxRate) */
DL.register('fx', function () {
  const dmy = DL.dmy;
  const FX_KEY = 'dimelog_fx';
  const seed = () => { try { return (window.INV_FX && window.INV_FX.rates) || {}; } catch (e) { return {}; } };
  const loadUser = () => { try { return JSON.parse(localStorage.getItem(FX_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const saveUser = (m) => { try { localStorage.setItem(FX_KEY, JSON.stringify(m || {})); } catch (e) {} };

  const bodyEl = document.getElementById('fxBody');
  const countEl = document.getElementById('fxCount');

  function render() {
    const s = seed(), u = loadUser();
    const all = Object.assign({}, s, u);
    const dates = Object.keys(all).sort().reverse();   // ใหม่→เก่า
    countEl.textContent = `${dates.length} วัน`;
    bodyEl.innerHTML = dates.map(d => {
      const fromUser = u[d] != null;
      const src = fromUser ? '<span class="chip">กรอกเอง</span>' : '<span class="chip" style="opacity:.6">seed</span>';
      const del = fromUser ? `<button class="btn secondary" data-del="${d}" style="padding:2px 8px;">ลบ</button>` : '';
      return `<tr><td>${dmy(d)}</td><td class="r" style="font-family:var(--mono)">${Number(all[d]).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4})}</td><td>${src}</td><td>${del}</td></tr>`;
    }).join('');
    bodyEl.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
      const u2 = loadUser(); delete u2[b.dataset.del]; saveUser(u2); render(); afterChange();
    }));
  }

  // การ reset ให้หน้าอื่น re-render จัดการใน app.js show() ตอน "ออกจากแท็บ FX"
  // (rendered flags เป็น private ใน app.js — pattern เดียวกับ Classify/Holdings)
  function afterChange() { /* no-op: ดู app.js show() leaving-fx branch */ }

  document.getElementById('btnFxAdd').addEventListener('click', () => {
    const d = document.getElementById('fxDate').value;
    const v = parseFloat(document.getElementById('fxVal').value);
    if (!d) { alert('เลือกวันที่ก่อน'); return; }
    if (!(v > 0)) { alert('ใส่เรทให้ถูกต้อง'); return; }
    const u = loadUser(); u[d] = v; saveUser(u);
    document.getElementById('fxVal').value = '';
    render(); afterChange();
  });

  function template() {
    const all = Object.assign({}, seed(), loadUser());
    const rows = Object.keys(all).sort().map(d => ({ date: d, rate_thb_per_usd: all[d] }));
    if (!rows.length) rows.push({ date: '2026-01-01', rate_thb_per_usd: 33.0 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'FX');
    XLSX.writeFile(wb, 'WealthMan_FX_Template.xlsx');
  }

  function importXlsx(ev) {
    const file = ev.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb = XLSX.read(rd.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const u = loadUser(); let n = 0;
        rows.forEach(r => {
          // ยอมรับหลายชื่อคอลัมน์: date / วันที่ ; rate_thb_per_usd / rate / เรท
          let d = r.date || r['วันที่'] || r.Date;
          const v = parseFloat(r.rate_thb_per_usd != null ? r.rate_thb_per_usd : (r.rate != null ? r.rate : r['เรท']));
          if (d == null || !(v > 0)) return;
          // normalize วันที่เป็น yyyy-mm-dd
          if (typeof d === 'number') { const dt = XLSX.SSF.parse_date_code(d); if (dt) d = `${dt.y}-${String(dt.m).padStart(2,'0')}-${String(dt.d).padStart(2,'0')}`; }
          else { d = String(d).trim().slice(0, 10); }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
          u[d] = v; n++;
        });
        saveUser(u); render(); afterChange();
        alert('นำเข้าเรทสำเร็จ: ' + n + ' วัน');
      } catch (e) { alert('นำเข้าไม่สำเร็จ: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsArrayBuffer(file);
  }

  document.getElementById('btnFxTemplate').addEventListener('click', template);
  document.getElementById('btnFxImport').addEventListener('click', () => document.getElementById('fxImportFile').click());
  document.getElementById('fxImportFile').addEventListener('change', importXlsx);

  render();
});
