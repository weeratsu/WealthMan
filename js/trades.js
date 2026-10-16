/* DimeLog — Trades panel (table + filters + export/backup/import) */
DL.register('trades', function (payload) {
  const dmy = DL.dmy, clsLabel = DL.clsLabel;
  let CURRENT = [];
  let grid = null;
  const TRADES = () => (DL.payload.trades || []);

  const sub = document.getElementById('trdSub');
  const dates = TRADES().map(t => t.iso_date).filter(Boolean).sort();
  sub.textContent = `${DL.payload.trade_count || TRADES().length} รายการ · ช่วง ${dmy(dates[0])} – ${dmy(dates[dates.length - 1])}`;

  // security filter options (เรียง A→Z)
  const fSec = document.getElementById('fSec');
  if (fSec) {
    fSec.innerHTML = '<option value="">All securities</option>';
    [...new Set(TRADES().map(t => t.security).filter(Boolean))].sort()
      .forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; fSec.appendChild(o); });
  }

  // year filter options
  const fYear = document.getElementById('fYear');
  fYear.innerHTML = '<option value="">All years</option>';
  [...new Set(TRADES().map(t => (t.iso_date || '').slice(0, 4)).filter(Boolean))].sort()
    .forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; fYear.appendChild(o); });

  // class filter — สร้างจากข้อมูลจริง (เดิม fix ไว้แค่ offshore/mutual_fund → ไม่มี gold)
  DL.buildClassOptions(document.getElementById('fClass'), 'All classes');

  Grid.setOptions({ gridKey: 'AV58-GK4N-VJLA-A22K-06Z2-NDM9', credits: { enabled: false } });

  function renderGrid(list) {
    CURRENT = list;
    document.getElementById('rowCount').textContent = `${list.length} รายการ`;
    const num = d => ({ cells: { formatter() { return this.value == null ? '' : Number(this.value).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); } } });
    const PRIV = DL.isPrivate();
    const mnum = d => ({ cells: { formatter() { return this.value == null ? '' : (PRIV ? '•••••' : Number(this.value).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })); } } });
    const data = {
      date: list.map(t => t.iso_date || ''), cls: list.map(t => clsLabel(t.asset_class)),
      type: list.map(t => t.type), sec: list.map(t => t.security), exch: list.map(t => t.exchange || '-'),
      units: list.map(t => t.units), price: list.map(t => t.price), ccy: list.map(t => t.ccy),
      fx: list.map(t => { const v = t.fx_thb_usd; if (v != null && v !== '') return v; const a = t.total_usd, b = t.total_thb; return (a && b) ? b / a : null; }),
      gusd: list.map(t => t.gross_usd), thb: list.map(t => t.total_thb), tusd: list.map(t => t.total_usd),
      fee: list.map(t => t.fee_thb), fusd: list.map(t => t.fee_usd), txn: list.map(t => t.txn_id),
    };
    const columns = [
      { id: 'date', header: 'วันที่', cells: { formatter() { return this.value ? dmy(this.value) : ''; } } }, { id: 'cls', header: 'ชนิด' }, { id: 'type', header: 'ประเภท' },
      { id: 'sec', header: 'หลักทรัพย์' }, { id: 'exch', header: 'ตลาด' },
      { id: 'units', header: 'จำนวนหน่วย', cells: { formatter() { return this.value == null ? '' : Number(this.value).toLocaleString('en-US', { maximumFractionDigits: 7 }); } } },
      { id: 'price', header: 'ราคา/หน่วย', ...num(4) }, { id: 'ccy', header: 'สกุล' },
      { id: 'fx', header: 'FX (THB/USD)', cells: { formatter() { return this.value == null ? '—' : Number(this.value).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }); } } },
      { id: 'gusd', header: 'Gross (USD)', ...mnum(2) }, { id: 'thb', header: 'มูลค่า (THB)', ...mnum(2) },
      { id: 'tusd', header: 'Total (USD)', ...mnum(2) }, { id: 'fee', header: 'ค่าธรรมเนียม (THB)', ...mnum(2) },
      { id: 'fusd', header: 'Fee (USD)', ...mnum(2) }, { id: 'txn', header: 'Txn ID' },
    ];
    if (grid) { grid.update({ dataTable: { columns: data } }); syncGrid(); }
    // ปิด virtualization: ข้อมูลไม่กี่ร้อยแถว การ render ครั้งเดียวลื่นกว่า (virtualization เหมาะกับ 1000+ แถว และทำให้ scroll กระตุกตอนแถวน้อย)
    else {
      grid = Grid.grid('tableWrap', { dataTable: { columns: data }, rendering: { rows: { virtualization: false } }, columnDefaults: { sorting: { sortable: true } }, columns });
      // re-apply tooltips after a header click (sort ทำให้ header re-render)
      const wrap = document.getElementById('tableWrap');
      if (wrap && !wrap.dataset.tipHook) { wrap.dataset.tipHook = '1'; wrap.addEventListener('click', applyHeaderTips); }
      syncGrid();
    }
    applyHeaderTips();
  }

  // บังคับ Grid Pro คำนวณความกว้างคอลัมน์ใหม่หลัง paint แรก (scrollbar แนวตั้งเพิ่ง render → header/body จะได้ตรงกัน)
  function syncGrid() {
    requestAnimationFrame(() => {
      try {
        if (!grid) return;
        if (typeof grid.reflow === 'function') grid.reflow();
        else if (grid.viewport && typeof grid.viewport.reflow === 'function') grid.viewport.reflow();
      } catch (e) { /* เงียบ */ }
    });
  }

  // แก้ปัญหา header/cell ไม่ตรงกันตอน resize หน้าต่าง — บังคับ Grid Pro คำนวณความกว้างคอลัมน์ใหม่
  if (!window.__trdResizeHook) {
    window.__trdResizeHook = true;
    let rz;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        try {
          if (!grid) return;
          if (typeof grid.reflow === 'function') grid.reflow();
          else if (grid.viewport && typeof grid.viewport.reflow === 'function') grid.viewport.reflow();
          else grid.update({});   // fallback: บังคับ re-render
          applyHeaderTips();
        } catch (e) { /* เงียบไว้ ไม่ให้ล้มทั้งหน้า */ }
      }, 150);
    });
  }

  // คำอธิบายแต่ละหัวคอลัมน์ (แสดงเป็น tooltip ตอนเอาเมาส์ชี้)
  const HEADER_TIPS = {
    date: 'วันที่ทำรายการ (ตามใบยืนยัน)',
    cls: 'ชนิดสินทรัพย์ — Offshore = หุ้นต่างประเทศ, Mutual Fund = กองทุนรวมไทย',
    type: 'ประเภทรายการ — SUB=ซื้อกองทุน, RED=ขายกองทุน, SWI/SWO=สับเปลี่ยนเข้า/ออก, BUY=ซื้อหุ้น, SEL=ขายหุ้น',
    sec: 'ชื่อหลักทรัพย์/กองทุน',
    exch: 'ตลาดหลักทรัพย์ (NASDAQ/NYSE) — กองทุนไทยเป็น "-"',
    units: 'จำนวนหน่วย/หุ้นที่ได้รับ',
    price: 'ราคาต่อหน่วย',
    ccy: 'สกุลเงินของรายการ (THB/USD)',
    fx: 'อัตราแลกเปลี่ยน THB ต่อ 1 USD ของรายการนั้น (กองทุนไทยไม่มี = —)',
    gusd: 'มูลค่ารวมก่อนหักค่าธรรมเนียม สกุล USD (Gross)',
    thb: 'มูลค่ารวมเป็นเงินบาท (THB)',
    tusd: 'มูลค่ารวมสุทธิ สกุล USD (Total)',
    fee: 'ค่าธรรมเนียมเป็นเงินบาท (THB)',
    fusd: 'ค่าธรรมเนียม สกุล USD',
    txn: 'เลขอ้างอิงรายการ (Transaction ID)',
  };
  function applyHeaderTips() {
    // Grid Pro v3 ใช้ <thead><th> จริง — เติม title ที่ th และ element ข้อความข้างใน (.hcg-header-cell-content)
    const ids = ['date','cls','type','sec','exch','units','price','ccy','fx','gusd','thb','tusd','fee','fusd','txn'];
    const run = () => {
      const wrap = document.getElementById('tableWrap');
      if (!wrap) return false;
      const ths = wrap.querySelectorAll('thead th');
      if (!ths.length) return false;
      ths.forEach((th, i) => {
        const tip = HEADER_TIPS[ids[i]];
        if (!tip) return;
        th.setAttribute('title', tip);
        th.style.cursor = 'help';
        const content = th.querySelector('.hcg-header-cell-content');
        if (content) content.setAttribute('title', tip);
      });
      return true;
    };
    // ลองหลายครั้งเผื่อ header ยัง render ไม่เสร็จ
    let tries = 0;
    const timer = setInterval(() => { if (run() || ++tries > 10) clearInterval(timer); }, 80);
  }

  // แปลง dd/mm/yyyy -> yyyy-mm-dd (คืน '' ถ้าว่าง/ไม่ครบ) เพื่อเทียบช่วงวันที่
  function dmyToIso(s) {
    s = (s || '').trim(); if (!s) return '';
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    const d = m[1].padStart(2, '0'), mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }

  function applyFilter() {
    const q = document.getElementById('fSearch').value.trim().toLowerCase();
    const cls = document.getElementById('fClass').value;
    const sec = document.getElementById('fSec').value;
    const ty = document.getElementById('fTxnType').value;
    const ccy = document.getElementById('fCcy').value;
    const yr = fYear.value;
    // native date picker ให้ค่าเป็น yyyy-mm-dd อยู่แล้ว เทียบกับ iso_date ได้ตรง
    const from = document.getElementById('fDateFrom').value;
    const to = document.getElementById('fDateTo').value;
    const list = TRADES().filter(t => {
      if (cls && t.asset_class !== cls) return false;
      if (sec && t.security !== sec) return false;
      if (ty && t.type !== ty) return false;
      if (ccy && (t.ccy || '') !== ccy) return false;
      if (yr && (t.iso_date || '').slice(0, 4) !== yr) return false;
      const iso = t.iso_date || '';
      if (from && iso && iso < from) return false;
      if (to && iso && iso > to) return false;
      if (q) { const hay = `${t.security} ${t.order_no} ${t.txn_id} ${t.exchange}`.toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
    renderGrid(list);
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Dime Trades');
    XLSX.writeFile(wb, `Dime_Trades_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function backupJSON() {
    const blob = new Blob([JSON.stringify(DL.payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `Dime_Backup_${new Date().toISOString().slice(0, 10)}.json`; a.click();
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
        DL.refreshAll();   // re-render ทุก panel (dashboard/tax/trades) ด้วยข้อมูลใหม่
      } catch (e) { alert('นำเข้าไม่สำเร็จ: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsText(file);
  }

  document.getElementById('fSearch').addEventListener('input', applyFilter);
  document.getElementById('fClass').addEventListener('change', applyFilter);
  document.getElementById('fSec').addEventListener('change', applyFilter);
  document.getElementById('fTxnType').addEventListener('change', applyFilter);
  document.getElementById('fCcy').addEventListener('change', applyFilter);
  document.getElementById('fDateFrom').addEventListener('input', applyFilter);
  document.getElementById('fDateTo').addEventListener('input', applyFilter);
  fYear.addEventListener('change', applyFilter);
  document.getElementById('fClear').addEventListener('click', () => {
    ['fSearch','fClass','fSec','fTxnType','fCcy','fYear','fDateFrom','fDateTo'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    applyFilter();
  });
  document.getElementById('btnExport').addEventListener('click', exportExcel);
  document.getElementById('btnBackup').addEventListener('click', backupJSON);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change', importJSON);

  applyFilter();
});
