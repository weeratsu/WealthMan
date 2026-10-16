/* DimeLog — Holdings panel: สรุปต่อหลักทรัพย์ (symbol) + ราคาปัจจุบัน → กำไร/ขาดทุน
 * หน่วยคงเหลือ, เงินลงทุนสุทธิ, ต้นทุนเฉลี่ย, ราคาปัจจุบัน (กรอก/import), มูลค่าตลาด, กำไร/ขาดทุน (%)
 * ราคาเก็บใน localStorage (dimelog_prices) ทับค่าตั้งต้น window.DIME_PRICES (จาก OCR watchlist)
 * มี KPI รวม + ตารางเรียง/กรอง + คลิกดูรายละเอียด + Export/Template/Import ราคา
 */
DL.register('holdings', function (payload) {
  const trades = (payload.trades || []);
  const fmt = DL.fmt, money = DL.money, dmy = DL.dmy, clsLabel = DL.clsLabel;
  const BUY = { BUY: 1, SUB: 1, SWI: 1 }, SELL = { SEL: 1, RED: 1, SWO: 1 };
  const PRICE_KEY = 'dimelog_prices';

  // ---- ราคาปัจจุบัน: localStorage ทับ seed ----
  function seedPrices() { return (window.DIME_PRICES && window.DIME_PRICES.prices) || {}; }
  function loadPrices() {
    const seed = Object.assign({}, seedPrices());
    try { Object.assign(seed, JSON.parse(localStorage.getItem(PRICE_KEY) || '{}') || {}); } catch (e) {}
    return seed;
  }
  function userPrices() { try { return JSON.parse(localStorage.getItem(PRICE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function setPrice(sym, val) {
    const m = userPrices();
    if (val === '' || val == null || isNaN(+val)) delete m[sym]; else m[sym] = +val;
    try { localStorage.setItem(PRICE_KEY, JSON.stringify(m)); } catch (e) {}
  }

  // ---- aggregate per security ----
  function build() {
    const prices = loadPrices();
    const m = {};
    trades.forEach(t => {
      const s = t.security || '-';
      const a = m[s] || (m[s] = {
        sym: s, cls: t.asset_class, units: 0, inv_thb: 0, inv_usd: 0,
        fees_thb: 0, buys: 0, sells: 0, n: 0, ccy: '', first: '', last: '',
      });
      a.cls = t.asset_class;
      if (t.ccy) a.ccy = t.ccy;
      const u = t.units || 0;
      if (BUY[t.type]) { a.units += u; a.buys++; a.inv_thb += (t.total_thb || 0); a.inv_usd += (t.total_usd || 0); }
      else if (SELL[t.type]) { a.units -= u; a.sells++; a.inv_thb -= (t.total_thb || 0); a.inv_usd -= (t.total_usd || 0); }
      a.fees_thb += (t.fee_thb || 0);
      a.n++;
      const d = t.iso_date || '';
      if (d) { a.first = a.first ? (d < a.first ? d : a.first) : d; a.last = a.last ? (d > a.last ? d : a.last) : d; }
    });
    return Object.values(m).map(a => {
      a.type = DL.typeOf(a.sym) || '';
      a.held = a.units > 0.0000001;
      a.avg_native = a.held ? (a.ccy === 'USD' ? a.inv_usd / a.units : a.inv_thb / a.units) : null;
      a.inv_native = a.ccy === 'USD' ? a.inv_usd : a.inv_thb;   // เงินลงทุนในสกุลเดียวกับราคา
      // ราคาปัจจุบัน (สกุลเดียวกับหลักทรัพย์)
      const p = prices[a.sym];
      a.price = (p == null || p === '') ? null : +p;
      if (a.held && a.price != null) {
        a.mkt_native = a.price * a.units;                 // มูลค่าตลาด (native)
        a.pl_native = a.mkt_native - a.inv_native;        // กำไร/ขาดทุน (native)
        a.pl_pct = a.inv_native ? (a.pl_native / a.inv_native) * 100 : null;
      } else { a.mkt_native = null; a.pl_native = null; a.pl_pct = null; }
      return a;
    });
  }

  let ROWS = build();
  let sortCol = 'inv_thb', sortDir = -1;

  const kpiEl = document.getElementById('hldKpis');
  const body = document.getElementById('hldBody');
  const countEl = document.getElementById('hldCount');
  const searchEl = document.getElementById('hldSearch');
  const clsEl = document.getElementById('hldClass');
  const typeEl = document.getElementById('hldType');

  if (typeEl && !typeEl.dataset.built) {
    typeEl.dataset.built = '1';
    typeEl.innerHTML = '<option value="">All types</option>' +
      DL.SEC_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  }
  // class filter — สร้างจากข้อมูลจริง (เดิม fix ไว้แค่ offshore/mutual_fund → ไม่มี gold)
  DL.buildClassOptions(clsEl, 'All classes');

  function kpis(rows) {
    const held = rows.filter(r => r.held);
    const totTHB = rows.reduce((s, r) => s + r.inv_thb, 0);
    // กำไร/ขาดทุน รวม (เฉพาะที่มีราคา) — แยกสกุล USD/THB
    let plUsd = 0, plThb = 0, haveUsd = false, haveThb = false;
    held.forEach(r => {
      if (r.pl_native == null) return;
      if (r.ccy === 'USD') { plUsd += r.pl_native; haveUsd = true; }
      else { plThb += r.pl_native; haveThb = true; }
    });
    const priced = held.filter(r => r.price != null).length;
    const card = (label, val, unit, cls) => `<div class="kpi"><div class="label">${label}</div><div class="value"${cls ? ` style="color:${cls}"` : ''}>${val}${unit ? ` <span class="unit">${unit}</span>` : ''}</div></div>`;
    const plColor = v => v > 0 ? 'var(--success)' : v < 0 ? 'var(--error,#d33)' : '';
    const plStr = (haveUsd ? (plUsd >= 0 ? '+' : '') + money(plUsd, 2) + ' USD' : '') +
                  (haveUsd && haveThb ? ' · ' : '') +
                  (haveThb ? (plThb >= 0 ? '+' : '') + money(plThb, 0) + ' THB' : '') || '—';
    kpiEl.innerHTML =
      card('เงินลงทุนสุทธิ', money(totTHB, 0), 'THB') +
      card('ถืออยู่', held.length, 'ตัว') +
      card('ใส่ราคาแล้ว', priced + '/' + held.length, 'ตัว') +
      card('กำไร/ขาดทุน (ที่มีราคา)', plStr, '', plColor(haveUsd ? plUsd : plThb));
  }

  function current() {
    const q = (searchEl.value || '').trim().toLowerCase();
    const fc = clsEl.value, ft = typeEl.value;
    let list = ROWS.filter(r => {
      if (q && !r.sym.toLowerCase().includes(q)) return false;
      if (fc && r.cls !== fc) return false;
      if (ft && r.type !== ft) return false;
      return true;
    });
    const dir = sortDir;
    list.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'number' || typeof vb === 'number' || va == null || vb == null) {
        return ((va || 0) - (vb || 0)) * dir;
      }
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return list;
  }

  function plCell(r) {
    if (!r.held) return '<td>—</td><td>—</td>';
    if (r.price == null) return '<td style="color:var(--muted)">ใส่ราคา</td><td>—</td>';
    const col = r.pl_native > 0 ? 'var(--success)' : r.pl_native < 0 ? 'var(--error,#d33)' : 'var(--text)';
    const sign = r.pl_native >= 0 ? '+' : '';
    const pct = r.pl_pct != null ? ` (${sign}${fmt(r.pl_pct, 1)}%)` : '';
    return `<td>${money(r.mkt_native, 2)}</td>` +
           `<td style="color:${col}">${sign}${money(r.pl_native, 2)}${pct}</td>`;
  }

  function render() {
    const list = current();
    kpis(list);
    countEl.textContent = `${list.length} หลักทรัพย์`;
    body.innerHTML = list.map(r => {
      const unitStr = (r.units).toLocaleString('en-US', { maximumFractionDigits: 7 });
      const avg = r.avg_native != null ? fmt(r.avg_native, 4) : '—';
      const typeTag = r.type ? r.type : '<span style="color:var(--muted)">—</span>';
      const priceInput = r.held
        ? `<input type="number" step="any" class="hld-price" data-sym="${r.sym.replace(/"/g, '&quot;')}" value="${r.price != null ? r.price : ''}" placeholder="—" style="width:92px;text-align:right;font-family:var(--mono);font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);">`
        : '<span style="color:var(--muted)">—</span>';
      return `<tr${r.held ? '' : ' style="opacity:.55"'}>
        <td class="yr hld-sym" data-sym="${r.sym.replace(/"/g, '&quot;')}" style="cursor:pointer" title="คลิกดูรายการของ ${r.sym}">${r.sym}${r.held ? '' : ' <span style="font-size:10px;color:var(--muted)">(ปิดแล้ว)</span>'}</td>
        <td style="text-align:left;font-family:var(--font)">${clsLabel(r.cls)}</td>
        <td style="text-align:left;font-family:var(--font)">${typeTag}</td>
        <td>${unitStr}</td>
        <td>${r.ccy || '-'}</td>
        <td>${avg}</td>
        <td>${priceInput}</td>
        ${plCell(r)}
        <td>${money(r.inv_thb, 2)}</td>
        <td>${r.n}</td>
      </tr>`;
    }).join('');
    // คลิกชื่อ -> detail
    body.querySelectorAll('.hld-sym').forEach(td => td.addEventListener('click', () => openDetail(td.getAttribute('data-sym'))));
    // แก้ราคา -> บันทึก + re-render (เฉพาะแถวนั้น KPI อัปเดต)
    body.querySelectorAll('input.hld-price').forEach(inp => {
      inp.addEventListener('change', () => {
        setPrice(inp.getAttribute('data-sym'), inp.value);
        ROWS = build(); render();
      });
    });
  }

  // ---- detail drill-down ----
  function openDetail(sym) {
    const rows = trades.filter(t => t.security === sym)
      .sort((a, b) => (a.iso_date || '').localeCompare(b.iso_date || ''));
    const a = ROWS.find(r => r.sym === sym);
    const dlg = document.getElementById('hldDetail');
    document.getElementById('hldDetailTitle').textContent = sym + '  ·  ' + clsLabel(a.cls) + (a.type ? '  ·  ' + a.type : '');
    const plTxt = (a.pl_native != null) ? ` · กำไร/ขาดทุน <b style="color:${a.pl_native >= 0 ? 'var(--success)' : 'var(--error,#d33)'}">${a.pl_native >= 0 ? '+' : ''}${money(a.pl_native, 2)} ${a.ccy}${a.pl_pct != null ? ` (${a.pl_pct >= 0 ? '+' : ''}${fmt(a.pl_pct, 1)}%)` : ''}</b>` : '';
    document.getElementById('hldDetailSub').innerHTML =
      `หน่วยคงเหลือ <b>${a.units.toLocaleString('en-US', { maximumFractionDigits: 7 })}</b> · ` +
      `เงินลงทุนสุทธิ <b>฿${money(a.inv_thb, 2)}</b>` + (a.inv_usd ? ` ($${money(a.inv_usd, 2)})` : '') +
      ` · ต้นทุนเฉลี่ย <b>${a.avg_native != null ? fmt(a.avg_native, 4) : '—'}</b> ${a.ccy || ''}/หน่วย` +
      (a.price != null ? ` · ราคาปัจจุบัน <b>${fmt(a.price, 4)} ${a.ccy}</b>` : '') + plTxt;
    document.getElementById('hldDetailBody').innerHTML = rows.map(t => `<tr>
      <td class="yr">${dmy(t.iso_date)}</td>
      <td style="font-family:var(--font)">${t.type}</td>
      <td>${(t.units || 0).toLocaleString('en-US', { maximumFractionDigits: 7 })}</td>
      <td>${fmt(t.price, 4)}</td>
      <td>${t.ccy || '-'}</td>
      <td>${money(t.total_thb, 2)}</td>
      <td>${t.total_usd != null ? money(t.total_usd, 2) : '—'}</td>
      <td>${money(t.fee_thb, 2)}</td>
    </tr>`).join('');
    dlg.style.display = 'flex';
  }
  function closeDetail() { document.getElementById('hldDetail').style.display = 'none'; }
  document.getElementById('hldDetailClose').onclick = closeDetail;
  document.getElementById('hldDetail').addEventListener('click', e => { if (e.target.id === 'hldDetail') closeDetail(); });

  // ---- sortable headers ----
  const headerMap = ['sym', 'cls', 'type', 'units', 'ccy', 'avg_native', 'price', 'mkt_native', 'pl_native', 'inv_thb', 'n'];
  const thead = document.querySelector('#hldTable thead tr');
  if (thead && !thead.dataset.sortable) {
    thead.dataset.sortable = '1';
    [...thead.children].forEach((th, i) => {
      th.style.cursor = 'pointer'; th.title = 'คลิกเพื่อเรียง';
      th.addEventListener('click', () => {
        const col = headerMap[i]; if (!col) return;
        if (sortCol === col) sortDir = -sortDir; else { sortCol = col; sortDir = (typeof ROWS[0]?.[col] === 'number' || ROWS.some(r => typeof r[col] === 'number')) ? -1 : 1; }
        render();
      });
    });
  }

  searchEl.oninput = render;
  clsEl.onchange = render;
  typeEl.onchange = render;

  // ---- Export / Template / Import ราคา ----
  document.getElementById('btnHldExport').onclick = function () {
    const rows = current().filter(r => r.held).map(r => ({
      'หลักทรัพย์': r.sym, 'สกุล': r.ccy, 'หน่วยคงเหลือ': r.units,
      'ต้นทุนเฉลี่ย': r.avg_native, 'ราคาปัจจุบัน': r.price,
      'มูลค่าตลาด': r.mkt_native, 'กำไร/ขาดทุน': r.pl_native, '%': r.pl_pct,
      'เงินลงทุน (THB)': r.inv_thb,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Holdings');
    XLSX.writeFile(wb, `Dime_Holdings_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  document.getElementById('btnHldTemplate').onclick = function () {
    // template: ทุก symbol ที่ถืออยู่ + ราคาปัจจุบัน (เติมค่าปัจจุบันให้แก้ง่าย)
    const rows = ROWS.filter(r => r.held).sort((a, b) => a.sym.localeCompare(b.sym))
      .map(r => ({ security: r.sym, price: r.price != null ? r.price : '', ccy: r.ccy }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: ['security', 'price', 'ccy'] });
    XLSX.utils.sheet_add_aoa(ws, [['ชื่อหลักทรัพย์', 'ราคาปัจจุบัน (ต่อหน่วย)', 'สกุล (อ้างอิง)']], { origin: 'A1' });
    XLSX.utils.sheet_add_json(ws, rows, { header: ['security', 'price', 'ccy'], skipHeader: true, origin: 'A2' });
    XLSX.utils.book_append_sheet(wb, ws, 'Prices');
    XLSX.writeFile(wb, 'Dime_Prices_Template.xlsx');
  };
  document.getElementById('btnHldImport').onclick = () => document.getElementById('hldImportFile').click();
  document.getElementById('hldImportFile').onchange = function (ev) {
    const file = ev.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb = XLSX.read(rd.result, { type: 'binary' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const m = userPrices(); let n = 0;
        rows.forEach(r => {
          const sym = (r.security || '').toString().trim();
          const price = r.price;
          if (!sym) return;
          if (price === '' || price == null || isNaN(+price)) return;
          m[sym] = +price; n++;
        });
        if (!n) throw new Error('ไม่พบราคาที่ถูกต้อง (ต้องมีคอลัมน์ security + price)');
        localStorage.setItem(PRICE_KEY, JSON.stringify(m));
        ROWS = build(); render();
        alert('นำเข้าราคาสำเร็จ: ' + n + ' รายการ');
      } catch (e) { alert('นำเข้าไม่สำเร็จ: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsBinaryString(file);
  };

  ROWS = build();
  render();
});
