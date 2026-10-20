/* DimeLog — Tax report panel */
DL.register('tax', function (payload) {
  const C = DL.C, fmt = DL.fmt, money = DL.money, dmy = DL.dmy, isBuy = DL.isBuy, isSell = DL.isSell;
  const trades = (payload.trades || []).slice();

  // ----- โหลดปันผล + เรท FX ไว้ล่วงหน้า (ใช้ในตารางสรุปรายปีด้วย) -----
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
    const net = _g2(d.gross_usd) - _g2(d.wht_usd) - _g2(d.fee_usd);
    const netB = DL.usdToThb(net, d.pay_date, _fxMapTax); const whtB = DL.usdToThb(_g2(d.wht_usd), d.pay_date, _fxMapTax);
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
    rows += `<tr><td class="yr">${y}</td><td>${r.n}</td><td>${money(r.buy)}</td><td>${money(r.sell)}</td><td>${money(r.fee)}</td><td style="color:var(--success)">${dn ? money(dn, 0) : '—'}</td><td>${dw ? money(dw, 0) : '—'}</td></tr>`; });
  rows += `<tr class="total-row"><td>รวม</td><td>${tot.n}</td><td>${money(tot.buy)}</td><td>${money(tot.sell)}</td><td>${money(tot.fee)}</td><td>${money(tot.divNet, 0)}</td><td>${money(tot.divWht, 0)}</td></tr>`;
  document.getElementById('taxYearBody').innerHTML = rows;

  // ----- class x year -----
  const CY = {};
  trades.forEach(t => { const y = (t.iso_date || '').slice(0, 4); if (!y) return; const cls = DL.clsLabel(t.asset_class);
    const k = y + '|' + cls; (CY[k] = CY[k] || { n: 0, buy: 0, fee: 0 }); const r = CY[k]; r.n++; r.fee += (t.fee_thb || 0); if (isBuy(t)) r.buy += (t.total_thb || 0); });
  let crows = '';
  Object.keys(CY).sort().forEach(k => { const [y, cls] = k.split('|'); const r = CY[k];
    crows += `<tr><td class="yr">${y}</td><td style="text-align:left;font-family:var(--font)">${cls}</td><td>${r.n}</td><td>${money(r.buy)}</td><td>${money(r.fee)}</td></tr>`; });
  document.getElementById('taxClassBody').innerHTML = crows;

  // ----- per-security -----
  const SEC = {};
  trades.forEach(t => { if (!isBuy(t)) return; const s = t.security || '-';
    (SEC[s] = SEC[s] || { cls: '', n: 0, units: 0, buy: 0, fee: 0 }); const r = SEC[s];
    r.cls = DL.clsLabel(t.asset_class); r.n++; r.units += (t.units || 0); r.buy += (t.total_thb || 0); r.fee += (t.fee_thb || 0); });
  const secRows = Object.entries(SEC).sort((a, b) => b[1].buy - a[1].buy);
  const fmtU = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 });
  let srows = '';
  secRows.forEach(([s, r]) => { srows += `<tr><td class="yr">${s}</td><td style="text-align:left;font-family:var(--font)">${r.cls}</td><td>${r.n}</td><td>${fmtU(r.units)}</td><td>${money(r.buy)}</td><td>${money(r.fee)}</td></tr>`; });
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
    `<tr><td class="yr">${ty}</td><td>${g.secs}</td><td>${g.n}</td><td>${money(g.buy)}</td><td>${money(g.fee)}</td></tr>`).join('');

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
    r.n++; r.gross += g2(d.gross_usd); r.wht += g2(d.wht_usd); r.net += netUsdOf(d); r.net_thb += netThbOf(d); });
  const divYears = Object.keys(DY).sort();
  const dtot = { n: 0, gross: 0, wht: 0, net: 0, net_thb: 0 };
  let dyrows = '';
  divYears.forEach(y => { const r = DY[y]; dtot.n += r.n; dtot.gross += r.gross; dtot.wht += r.wht; dtot.net += r.net; dtot.net_thb += r.net_thb;
    dyrows += `<tr><td class="yr">${y}</td><td>${r.n}</td><td style="color:var(--success)">${money(r.gross, 2)}</td><td>${money(r.wht, 2)}</td><td><b>${money(r.net, 2)}</b><span style="color:var(--muted);font-size:11px">${thbTot(r.net_thb)}</span></td></tr>`; });
  if (divYears.length) dyrows += `<tr class="total-row"><td>รวม</td><td>${dtot.n}</td><td>${money(dtot.gross, 2)}</td><td>${money(dtot.wht, 2)}</td><td>${money(dtot.net, 2)}<span style="color:var(--muted);font-size:11px">${thbTot(dtot.net_thb)}</span></td></tr>`;
  else dyrows = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">ยังไม่มีข้อมูลปันผล</td></tr>';
  const divYearBody = document.getElementById('taxDivYearBody'); if (divYearBody) divYearBody.innerHTML = dyrows;
  // by security
  const DS = {};
  divs.forEach(d => { const s = d.security || '-';
    (DS[s] = DS[s] || { n: 0, gross: 0, wht: 0, net: 0 }); const r = DS[s];
    r.n++; r.gross += g2(d.gross_usd); r.wht += g2(d.wht_usd); r.net += g2(d.gross_usd) - g2(d.wht_usd) - g2(d.fee_usd); });
  const divSecRows = Object.entries(DS).sort((a, b) => b[1].gross - a[1].gross);
  let dsrows = divSecRows.map(([s, r]) =>
    `<tr><td class="yr">${s}</td><td>${r.n}</td><td style="color:var(--success)">${money(r.gross, 2)}</td><td>${money(r.wht, 2)}</td><td><b>${money(r.net, 2)}</b></td></tr>`).join('');
  if (!divSecRows.length) dsrows = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">ยังไม่มีข้อมูลปันผล</td></tr>';
  const divSecBody = document.getElementById('taxDivSecBody'); if (divSecBody) divSecBody.innerHTML = dsrows;

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
    XLSX.writeFile(wb, `Dime_Tax_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  document.getElementById('btnTaxExport').onclick = exportTax;
});
