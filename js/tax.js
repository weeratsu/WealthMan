/* DimeLog — Tax report panel */
DL.register('tax', function (payload) {
  const C = DL.C, fmt = DL.fmt, money = DL.money, dmy = DL.dmy, isBuy = DL.isBuy, isSell = DL.isSell;
  const trades = DL.allTrades();   // auto + manual

  // ----- โหลดปันผล + เรท FX ไว้ล่วงหน้า (ใช้ในตารางสรุปรายปีด้วย) -----
  // dividend → THB amounts (รองรับ schema ใหม่ ccy/gross/wht/fee และเก่า gross_usd/wht_usd/fee_usd)
  const _pk = (d, a, b) => (d[a] != null && d[a] !== '') ? +d[a] : (+d[b] || 0);
  const divThb = (d, fx) => {
    const thb = String(d.ccy || 'USD').toUpperCase() === 'THB';
    const g = _pk(d, 'gross', 'gross_usd'), w = _pk(d, 'wht', 'wht_usd'), f = _pk(d, 'fee', 'fee_usd');
    const cv = v => thb ? v : (DL.usdToThb(v, d.pay_date, fx) || 0);
    return { g: cv(g), w: cv(w), n: cv(g - w - f) };
  };
  const _divsAll = (function () {
    const base = ((window.INV_DIVIDENDS && window.INV_DIVIDENDS.dividends) || []).slice();
    let imp = []; try { imp = JSON.parse(localStorage.getItem('dimelog_dividends_import') || '[]') || []; } catch (e) {}
    const map = {};
    base.concat(imp).forEach(d => { if (d.security && d.security !== '(TAF Fee)') map[d.security + '|' + d.pay_date] = d; });
    return Object.values(map);
  })();
  const _fxMapTax = DL.loadFx();
  const _g2 = v => +(+v || 0);
  // ปันผลต่อปี (บาท): สุทธิ + ภาษี US ที่ถูกหัก — แปลงแต่ละรายการด้วยเรทวันจ่าย
  const divYrNetThb = {}, divYrWhtThb = {};
  _divsAll.forEach(d => {
    const y = (d.pay_date || '').slice(0, 4); if (!y) return;
    const dv = divThb(d, _fxMapTax); const netB = dv.n, whtB = dv.w;
    divYrNetThb[y] = (divYrNetThb[y] || 0) + (netB || 0);
    divYrWhtThb[y] = (divYrWhtThb[y] || 0) + (whtB || 0);
  });

  // ----- yearly -----
  const Y = {};
  trades.forEach(t => {
    const y = (t.iso_date || '').slice(0, 4); if (!y) return;
    (Y[y] = Y[y] || { n: 0, buy: 0, sell: 0, fee: 0, wht: 0 });
    const r = Y[y]; r.n++; r.fee += (t.fee_thb || 0); r.wht += (t.wht_thb || 0);
    if (isBuy(t)) r.buy += (t.total_thb || 0); else if (isSell(t)) r.sell += (t.total_thb || 0);
  });
  // รวมปีที่มีเฉพาะปันผล (ไม่มี trade) เข้ามาด้วย
  Object.keys(divYrNetThb).forEach(y => { if (!Y[y]) Y[y] = { n: 0, buy: 0, sell: 0, fee: 0, wht: 0 }; });
  const years = Object.keys(Y).sort();
  const tot = { n: 0, buy: 0, sell: 0, fee: 0, divNet: 0, divWht: 0 };
  let rows = '';
  years.forEach(y => { const r = Y[y]; const dn = divYrNetThb[y] || 0, dw = divYrWhtThb[y] || 0;
    tot.n += r.n; tot.buy += r.buy; tot.sell += r.sell; tot.fee += r.fee; tot.divNet += dn; tot.divWht += dw;
    rows += `<tr data-pk="yr" data-y="${y}"><td class="yr">${y}</td><td>${r.n}</td><td>${money(r.buy)}</td><td>${money(r.sell)}</td><td>${money(r.fee)}</td><td style="color:var(--success)">${dn ? money(dn, 0) : '—'}</td><td>${dw ? money(dw, 0) : '—'}</td></tr>`; });
  rows += `<tr class="total-row"><td>รวม</td><td>${tot.n}</td><td>${money(tot.buy)}</td><td>${money(tot.sell)}</td><td>${money(tot.fee)}</td><td>${money(tot.divNet, 0)}</td><td>${money(tot.divWht, 0)}</td></tr>`;
  document.getElementById('taxYearBody').innerHTML = rows;
  // ---------- generic popup: trx list (+ dividends) for any summary row ----------
  function openTaxPop(title, list, dl) {
    list = list.slice().sort((a, b) => (a.iso_date < b.iso_date ? -1 : 1));
    dl = (dl || []).slice().sort((a, b) => (a.pay_date < b.pay_date ? -1 : 1));
    let ov = document.getElementById('taxYrOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'taxYrOv'; ov.className = 'dvf-ov'; document.body.appendChild(ov); ov.addEventListener('click', e => { if (e.target === ov) ov.style.display = 'none'; }); }
    const sum = (f, k) => list.filter(f).reduce((s, t) => s + (t[k] || 0), 0);
    const dTot = dl.reduce((s, d) => s + divThb(d, _fxMapTax).n, 0);
    const row = t => `<tr><td>${dmy(t.iso_date)}</td><td style="text-align:left">${t.security || ''}</td><td>${DL.clsLabel(t.asset_class)}</td><td><span style="color:${isSell(t) ? 'var(--error,#d33)' : 'var(--success)'};font-weight:600">${t.type}</span></td><td>${t.units != null ? fmt(t.units, 4) : '—'}</td><td>${t.ccy || ''}</td><td>${money(t.total_thb || 0)}</td><td>${money(t.fee_thb || 0)}</td></tr>`;
    const dRows = dl.map(d => { const v = divThb(d, _fxMapTax); return `<tr><td>${dmy(d.pay_date)}</td><td style="text-align:left">${d.security}</td><td>${String(d.ccy || 'USD').toUpperCase()}</td><td style="color:var(--success)">${money(v.g)}</td><td>${money(v.w)}</td><td><b>${money(v.n)}</b></td></tr>`; }).join('');
    ov.innerHTML = `<div class="dvf-box" style="width:min(980px,96vw)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0">${title} · ${list.length} รายการ</h2><button class="btn secondary" id="taxYrClose">ปิด</button></div>
      <div class="hint" style="margin-bottom:8px">ซื้อ ${money(sum(isBuy, 'total_thb'))} ฿ · ขาย ${money(sum(isSell, 'total_thb'))} ฿ · ค่าธรรมเนียม ${money(sum(() => true, 'fee_thb'))} ฿${dl.length ? ` · ปันผลสุทธิ ${money(dTot)} ฿` : ''}</div>
      <div style="max-height:65vh;overflow:auto">
        <table class="rpt"><thead><tr><th>Date</th><th style="text-align:left">Security</th><th>Class</th><th>Type</th><th>Units</th><th>Ccy</th><th>Total (THB)</th><th>Fee (THB)</th></tr></thead><tbody>${list.map(row).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted)">ไม่มีรายการซื้อขาย</td></tr>'}</tbody></table>
        ${dl.length ? `<h2 style="margin:16px 0 8px;font-size:15px">ปันผล ${dl.length} รายการ (THB)</h2><table class="rpt"><thead><tr><th>Pay Date</th><th style="text-align:left">Security</th><th>Ccy</th><th>Gross</th><th>WHT</th><th>Net</th></tr></thead><tbody>${dRows}</tbody></table>` : ''}
      </div></div>`;
    ov.style.display = 'flex';
    document.getElementById('taxYrClose').onclick = () => { ov.style.display = 'none'; };
  }
  const yOf = t => (t.iso_date || '').slice(0, 4), dyOf = d => (d.pay_date || '').slice(0, 4);
  function onTaxRow(tr) {
    const k = tr.dataset.pk, y = tr.dataset.y, v = tr.dataset.v ? decodeURIComponent(tr.dataset.v) : '';
    if (k === 'yr' || k === 'divyr') return openTaxPop('ปี ' + y, trades.filter(t => yOf(t) === y), _divsAll.filter(d => dyOf(d) === y));
    if (k === 'cls') { const L = trades.filter(t => yOf(t) === y && DL.clsLabel(t.asset_class) === v); const S = new Set(L.map(t => t.security));
      return openTaxPop(v + ' · ปี ' + y, L, _divsAll.filter(d => dyOf(d) === y && S.has(d.security))); }
    if (k === 'type') { const L = trades.filter(t => (DL.typeOf(t.security) || 'Unclassified') === v); const S = new Set(L.map(t => t.security));
      return openTaxPop('Type: ' + v, L, _divsAll.filter(d => S.has(d.security))); }
    if (k === 'sec' || k === 'divsec') return openTaxPop(v, trades.filter(t => t.security === v), _divsAll.filter(d => d.security === v));
  }
  function bindTaxRows() {
    ['taxYearBody','taxClassBody','taxTypeBody','taxSecBody','taxDivYearBody','taxDivSecBody'].forEach(id => {
      const tb = document.getElementById(id); if (!tb) return;
      tb.querySelectorAll('tr[data-pk]').forEach(tr => { tr.style.cursor = 'pointer'; tr.title = 'คลิกดูรายการ'; tr.onclick = () => onTaxRow(tr); });
    });
  }

  // ----- class x year -----
  const CY = {};
  trades.forEach(t => { const y = (t.iso_date || '').slice(0, 4); if (!y) return; const cls = DL.clsLabel(t.asset_class);
    const k = y + '|' + cls; (CY[k] = CY[k] || { n: 0, buy: 0, fee: 0 }); const r = CY[k]; r.n++; r.fee += (t.fee_thb || 0); if (isBuy(t)) r.buy += (t.total_thb || 0); });
  let crows = '';
  Object.keys(CY).sort().forEach(k => { const [y, cls] = k.split('|'); const r = CY[k];
    crows += `<tr data-pk="cls" data-y="${y}" data-v="${encodeURIComponent(cls)}"><td class="yr">${y}</td><td style="text-align:left;font-family:var(--font)">${cls}</td><td>${r.n}</td><td>${money(r.buy)}</td><td>${money(r.fee)}</td></tr>`; });
  document.getElementById('taxClassBody').innerHTML = crows;

  // ----- per-security -----
  const SEC = {};
  trades.forEach(t => { if (!isBuy(t)) return; const s = t.security || '-';
    (SEC[s] = SEC[s] || { cls: '', n: 0, units: 0, buy: 0, fee: 0 }); const r = SEC[s];
    r.cls = DL.clsLabel(t.asset_class); r.n++; r.units += (t.units || 0); r.buy += (t.total_thb || 0); r.fee += (t.fee_thb || 0); });
  const secRows = Object.entries(SEC).sort((a, b) => b[1].buy - a[1].buy);
  const fmtU = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 });
  let srows = '';
  secRows.forEach(([s, r]) => { srows += `<tr data-pk="sec" data-v="${encodeURIComponent(s)}"><td class="yr">${s}</td><td style="text-align:left;font-family:var(--font)">${r.cls}</td><td>${r.n}</td><td>${fmtU(r.units)}</td><td>${money(r.buy)}</td><td>${money(r.fee)}</td></tr>`; });
  document.getElementById('taxSecBody').innerHTML = srows;

  // ----- by custom type (from Classify) -----
  const TYPE = {};
  secRows.forEach(([s, r]) => {
    const ty = DL.typeOf(s) || 'Unclassified';
    (TYPE[ty] = TYPE[ty] || { secs: 0, n: 0, buy: 0, fee: 0 });
    const g = TYPE[ty]; g.secs++; g.n += r.n; g.buy += r.buy; g.fee += r.fee;
  });
  const typeRows = Object.entries(TYPE).sort((a, b) => b[1].buy - a[1].buy);
  document.getElementById('taxTypeBody').innerHTML = typeRows.map(([ty, g]) =>
    `<tr data-pk="type" data-v="${encodeURIComponent(ty)}"><td class="yr">${ty}</td><td>${g.secs}</td><td>${g.n}</td><td>${money(g.buy)}</td><td>${money(g.fee)}</td></tr>`).join('');

  // ----- dividends (USD) — จาก window.INV_DIVIDENDS + localStorage import -----
  function loadDivs() {
    const base = ((window.INV_DIVIDENDS && window.INV_DIVIDENDS.dividends) || []).slice();
    let imp = []; try { imp = JSON.parse(localStorage.getItem('dimelog_dividends_import') || '[]') || []; } catch (e) {}
    const map = {};
    base.concat(imp).forEach(d => { if (d.security && d.security !== '(TAF Fee)') map[d.security + '|' + d.pay_date] = d; });
    return Object.values(map);
  }
  const divs = loadDivs();
  const g2 = v => +(+v || 0);
  const fxMap = DL.loadFx();
  const netUsdOf = d => g2(d.gross_usd) - g2(d.wht_usd) - g2(d.fee_usd);
  const netThbOf = d => { const v = DL.usdToThb(netUsdOf(d), d.pay_date, fxMap); return v == null ? 0 : v; };
  const thbTot = n => DL.isPrivate() ? ' (≈฿•••)' : (n ? ` (≈฿${fmt(n, 0)})` : '');
  // by year
  const DY = {};
  divs.forEach(d => { const y = (d.pay_date || '').slice(0, 4); if (!y) return;
    (DY[y] = DY[y] || { n: 0, gross: 0, wht: 0, net: 0, net_thb: 0 }); const r = DY[y];
    const dv = divThb(d, fxMap); r.n++; r.gross += dv.g; r.wht += dv.w; r.net += dv.n; r.net_thb += dv.n; });
  const divYears = Object.keys(DY).sort();
  const dtot = { n: 0, gross: 0, wht: 0, net: 0, net_thb: 0 };
  let dyrows = '';
  divYears.forEach(y => { const r = DY[y]; dtot.n += r.n; dtot.gross += r.gross; dtot.wht += r.wht; dtot.net += r.net; dtot.net_thb += r.net_thb;
    dyrows += `<tr data-pk="divyr" data-y="${y}"><td class="yr">${y}</td><td>${r.n}</td><td style="color:var(--success)">${money(r.gross, 2)}</td><td>${money(r.wht, 2)}</td><td><b>${money(r.net, 2)}</b></td></tr>`; });
  if (divYears.length) dyrows += `<tr class="total-row"><td>รวม</td><td>${dtot.n}</td><td>${money(dtot.gross, 2)}</td><td>${money(dtot.wht, 2)}</td><td>${money(dtot.net, 2)}</td></tr>`;
  else dyrows = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">ยังไม่มีข้อมูลปันผล</td></tr>';
  ['taxDivYearBody','taxDivSecBody'].forEach(id => { const tb = document.getElementById(id); const th = tb && tb.parentElement.querySelector('thead'); if (th) th.querySelectorAll('th').forEach(h => { h.textContent = h.textContent.replace('(USD)', '(THB)'); }); });
  const divYearBody = document.getElementById('taxDivYearBody'); if (divYearBody) divYearBody.innerHTML = dyrows;
  // by security
  const DS = {};
  divs.forEach(d => { const s = d.security || '-';
    (DS[s] = DS[s] || { n: 0, gross: 0, wht: 0, net: 0 }); const r = DS[s];
    const dv = divThb(d, fxMap); r.n++; r.gross += dv.g; r.wht += dv.w; r.net += dv.n; });
  const divSecRows = Object.entries(DS).sort((a, b) => b[1].gross - a[1].gross);
  let dsrows = divSecRows.map(([s, r]) =>
    `<tr data-pk="divsec" data-v="${encodeURIComponent(s)}"><td class="yr">${s}</td><td>${r.n}</td><td style="color:var(--success)">${money(r.gross, 2)}</td><td>${money(r.wht, 2)}</td><td><b>${money(r.net, 2)}</b></td></tr>`).join('');
  if (!divSecRows.length) dsrows = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">ยังไม่มีข้อมูลปันผล</td></tr>';
  const divSecBody = document.getElementById('taxDivSecBody'); if (divSecBody) divSecBody.innerHTML = dsrows;
  bindTaxRows();

  // ----- charts -----
  Highcharts.chart('chartTaxYear', {
    chart: { type: 'column', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    xAxis: { categories: years, labels: { style: { color: C('--text2') } }, lineColor: C('--border-light') },
    yAxis: { title: { text: null }, labels: { style: { color: C('--text2') } }, gridLineColor: C('--border-light') },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, valueSuffix: ' THB', valueDecimals: 0, shared: true },
    plotOptions: { column: { borderRadius: 3 } },
    series: [
      { name: 'ยอดซื้อ', data: years.map(y => Math.round(Y[y].buy * 100) / 100), color: C('--primary') },
      { name: 'ค่าธรรมเนียม', data: years.map(y => Math.round(Y[y].fee * 100) / 100), color: C('--warning') },
    ],
    legend: { itemStyle: { color: C('--text2') } }, credits: { enabled: false }
  });

  const secTop = secRows.slice(0, 12).map(([s, r]) => ({ name: s, y: Math.round(r.buy * 100) / 100 }));
  const secOther = secRows.slice(12).reduce((a, [, r]) => a + r.buy, 0);
  if (secOther > 0) secTop.push({ name: 'อื่นๆ', y: Math.round(secOther * 100) / 100 });
  const secPalette = ['--primary', '--info', '--success', '--warning', '--error', '--primary-light'].map(C);
  Highcharts.chart('chartTaxSec', {
    chart: { type: 'pie', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, pointFormat: '<b>{point.y:,.0f} THB</b> ({point.percentage:.1f}%)' },
    plotOptions: { pie: { innerSize: '55%', dataLabels: { enabled: true, format: '{point.name}', style: { color: C('--text2'), fontSize: '11px' }, distance: 12 } } },
    series: [{ name: 'ยอดซื้อ', data: secTop }],
    colors: [...secPalette, '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#64748b', '#eab308'],
    credits: { enabled: false }
  });

  const dates = trades.map(t => t.iso_date).filter(Boolean).sort();
  document.getElementById('taxSub').textContent = `${trades.length} รายการ · ช่วง ${dmy(dates[0])} – ${dmy(dates[dates.length - 1])}`;

  // ----- export (3 sheets) -----
  function exportTax() {
    const wb = XLSX.utils.book_new();
    const y1 = years.map(y => ({ 'ปี': y, 'จำนวนรายการ': Y[y].n, 'ยอดซื้อ (THB)': +Y[y].buy.toFixed(2), 'ยอดขาย (THB)': +Y[y].sell.toFixed(2), 'ค่าธรรมเนียม (THB)': +Y[y].fee.toFixed(2), 'ภาษีหัก ณ ที่จ่าย (THB)': +Y[y].wht.toFixed(2) }));
    y1.push({ 'ปี': 'รวม', 'จำนวนรายการ': tot.n, 'ยอดซื้อ (THB)': +tot.buy.toFixed(2), 'ยอดขาย (THB)': +tot.sell.toFixed(2), 'ค่าธรรมเนียม (THB)': +tot.fee.toFixed(2), 'ภาษีหัก ณ ที่จ่าย (THB)': +tot.wht.toFixed(2) });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(y1), 'สรุปรายปี');
    const c1 = Object.keys(CY).sort().map(k => { const [y, cls] = k.split('|'); const r = CY[k]; return { 'ปี': y, 'ชนิด': cls, 'จำนวนรายการ': r.n, 'ยอดซื้อ (THB)': +r.buy.toFixed(2), 'ค่าธรรมเนียม (THB)': +r.fee.toFixed(2) }; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(c1), 'แยกตามชนิด');
    const s1 = secRows.map(([s, r]) => ({ 'หลักทรัพย์': s, 'ชนิด': r.cls, 'ประเภท': DL.typeOf(s) || 'Unclassified', 'จำนวนรายการ': r.n, 'จำนวนหน่วยรวม': +r.units.toFixed(6), 'ยอดซื้อ (THB)': +r.buy.toFixed(2), 'ค่าธรรมเนียม (THB)': +r.fee.toFixed(2) }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1), 'รายหลักทรัพย์');
    const t1 = typeRows.map(([ty, g]) => ({ 'ประเภท': ty, 'จำนวนหลักทรัพย์': g.secs, 'จำนวนรายการ': g.n, 'ยอดซื้อ (THB)': +g.buy.toFixed(2), 'ค่าธรรมเนียม (THB)': +g.fee.toFixed(2) }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t1), 'แยกตามประเภท');
    if (divYears.length) {
      const dy = divYears.map(y => ({ 'ปี': y, 'จำนวนครั้ง': DY[y].n, 'ปันผล (USD)': +DY[y].gross.toFixed(2), 'ภาษีหัก ณ ที่จ่าย (USD)': +DY[y].wht.toFixed(2), 'ปันผลสุทธิ (USD)': +DY[y].net.toFixed(2) }));
      dy.push({ 'ปี': 'รวม', 'จำนวนครั้ง': dtot.n, 'ปันผล (USD)': +dtot.gross.toFixed(2), 'ภาษีหัก ณ ที่จ่าย (USD)': +dtot.wht.toFixed(2), 'ปันผลสุทธิ (USD)': +dtot.net.toFixed(2) });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dy), 'ปันผลรายปี');
      const ds = divSecRows.map(([s, r]) => ({ 'หลักทรัพย์': s, 'จำนวนครั้ง': r.n, 'ปันผล (USD)': +r.gross.toFixed(2), 'ภาษีหัก (USD)': +r.wht.toFixed(2), 'ปันผลสุทธิ (USD)': +r.net.toFixed(2) }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ds), 'ปันผลรายหลักทรัพย์');
    }
    XLSX.writeFile(wb, `WealthMan_Tax_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  document.getElementById('btnTaxExport').onclick = exportTax;
});
