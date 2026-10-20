/* DimeLog — Dashboard panel */
DL.register('dashboard', function (payload) {
  const C = DL.C, fmt = DL.fmt, money = DL.money, dmy = DL.dmy, isBuy = DL.isBuy, isSell = DL.isSell;
  const trades = (payload.trades || []).slice();

  // KPIs
  const totalInvested = trades.filter(isBuy).reduce((a, t) => a + (t.total_thb || 0), 0);
  const totalSell = trades.filter(isSell).reduce((a, t) => a + (t.total_thb || 0), 0);
  const totalFee = trades.reduce((a, t) => a + (t.fee_thb || 0), 0);
  const nSec = new Set(trades.map(t => t.security)).size;
  const dates = trades.map(t => t.iso_date).filter(Boolean).sort();

  // ---- ราคาปัจจุบัน + กำไร/ขาดทุน (ใช้ localStorage ร่วมกับ Holdings + seed window.DIME_PRICES) ----
  const PRICE_KEY = 'dimelog_prices';
  function loadPrices() {
    const seed = Object.assign({}, (window.DIME_PRICES && window.DIME_PRICES.prices) || {});
    try { Object.assign(seed, JSON.parse(localStorage.getItem(PRICE_KEY) || '{}') || {}); } catch (e) {}
    return seed;
  }
  const BUYt = { BUY: 1, SUB: 1, SWI: 1 }, SELLt = { SEL: 1, RED: 1, SWO: 1 };
  const prices = loadPrices();
  const PRIV = DL.isPrivate();
  // สรุปต่อ symbol: หน่วยคงเหลือ + เงินลงทุน native
  const pos = {};
  trades.forEach(t => {
    const s = t.security || '-';
    const a = pos[s] || (pos[s] = { sym: s, ccy: '', units: 0, inv_native: 0 });
    if (t.ccy) a.ccy = t.ccy;
    const native = (t.ccy === 'USD') ? (t.total_usd || 0) : (t.total_thb || 0);
    if (BUYt[t.type]) { a.units += (t.units || 0); a.inv_native += native; }
    else if (SELLt[t.type]) { a.units -= (t.units || 0); a.inv_native -= native; }
  });
  let plUsd = 0, plThb = 0, mktUsd = 0, mktThb = 0;
  const plBySym = [];
  Object.values(pos).forEach(a => {
    if (a.units <= 0.0000001) return;
    const p = prices[a.sym];
    if (p == null || p === '' || isNaN(+p)) return;
    const mkt = (+p) * (a.units / DL.priceDivisor(a.sym)), pl = mkt - a.inv_native;
    if (a.ccy === 'USD') { plUsd += pl; mktUsd += mkt; } else { plThb += pl; mktThb += mkt; }
    plBySym.push({ sym: a.sym, pl: Math.round(pl * 100) / 100, ccy: a.ccy });
  });
  plBySym.sort((x, y) => y.pl - x.pl);

  // ---- ปันผล (window.INV_DIVIDENDS + localStorage import) ----
  function loadDivs() {
    const base = ((window.INV_DIVIDENDS && window.INV_DIVIDENDS.dividends) || []).slice();
    let imp = []; try { imp = JSON.parse(localStorage.getItem('dimelog_dividends_import') || '[]') || []; } catch (e) {}
    const map = {};
    base.concat(imp).forEach(d => { if (d.security && d.security !== '(TAF Fee)') map[d.security + '|' + d.pay_date] = d; });
    return Object.values(map);
  }
  const divs = loadDivs();
  const divGrossUsd = divs.reduce((s, d) => s + (+d.gross_usd || 0), 0);
  const divNetUsd = divs.reduce((s, d) => s + ((+d.gross_usd || 0) - (+d.wht_usd || 0) - (+d.fee_usd || 0)), 0);
  // ปันผลสุทธิเป็น THB (แปลงแต่ละรายการด้วยเรทวันจ่าย — เรทวันใกล้สุด)
  const _fxMap = DL.loadFx();
  const divNetThb = divs.reduce((s, d) => { const net = (+d.gross_usd || 0) - (+d.wht_usd || 0) - (+d.fee_usd || 0); const v = DL.usdToThb(net, d.pay_date, _fxMap); return s + (v || 0); }, 0);
  const _divThbSfx = DL.isPrivate() ? ' (≈฿•••)' : (divNetThb ? ` (≈฿${fmt(divNetThb, 0)})` : '');
  const divByMonth = {};
  divs.forEach(d => { const m = (d.pay_date || '').slice(0, 7); if (m) divByMonth[m] = (divByMonth[m] || 0) + (+d.gross_usd || 0); });
  // เติม ฿ ต่อท้ายส่วน USD (แปลงด้วยเรทล่าสุด)
  const _priv = DL.isPrivate();
  const _fxUsed = DL.fxRate(null);                     // เรท USD→THB ล่าสุด
  const _plUsdInThb = DL.usdToThb(plUsd, null);        // กำไรฝั่ง USD เป็นบาท
  let _plUsdThb = '';
  if ((plUsd || mktUsd) && !_priv) { if (_plUsdInThb != null) _plUsdThb = ` (≈${_plUsdInThb < 0 ? '-' : ''}฿${fmt(Math.abs(_plUsdInThb), 0)})`; }
  else if ((plUsd || mktUsd) && _priv) _plUsdThb = ' (≈฿•••)';
  const plStr = (plUsd || mktUsd ? (plUsd >= 0 ? '+' : '') + money(plUsd, 2) + ' USD' + _plUsdThb : '') +
                (plUsd && plThb ? ' · ' : '') +
                (plThb ? (plThb >= 0 ? '+' : '') + money(plThb, 0) + ' THB' : '') || '—';
  const plColor = (plUsd || 0) + (plThb || 0) > 0 ? 'var(--success)' : ((plUsd || 0) + (plThb || 0) < 0 ? 'var(--error,#d33)' : '');
  // รวมเป็นบาททั้งหมด = กำไร THB + กำไร USD แปลงบาท
  const _plAllThb = (plThb || 0) + (_plUsdInThb != null ? _plUsdInThb : 0);
  const _hasAny = (plUsd || plThb || mktUsd);
  const _allThbVal = _priv ? '•••••' : (_hasAny ? (_plAllThb >= 0 ? '+' : '') + fmt(_plAllThb, 0) : '—');
  const _fxNote = _fxUsed != null ? 'ใช้เรท ≈ ' + fmt(_fxUsed, 2) + ' ฿/USD' : '';
  const kpis = [
    { label: 'เงินลงทุนรวม', value: money(totalInvested, 0), unit: 'THB', note: 'รวมทุกตัวที่เคยซื้อ (รวมที่ขายหมดแล้ว)' },
    { label: 'หลักทรัพย์', value: nSec, unit: 'ตัว', note: 'นับทุกตัวที่เคยซื้อ · Holdings นับเฉพาะที่ยังถือ' },
    { label: 'ค่าธรรมเนียมรวม', value: money(totalFee, 2), unit: 'THB' },
    { label: 'ปันผลรับสุทธิ', value: money(divNetUsd, 2) + '<span style="color:var(--muted);font-size:12px">' + _divThbSfx + '</span>', unit: 'USD', color: 'var(--success)' },
    { label: 'กำไร/ขาดทุน (ที่ใส่ราคา)', value: plStr, unit: '', color: plColor, note: _fxNote },
    { label: 'กำไร/ขาดทุน รวมเป็นบาท', value: _allThbVal, unit: 'THB', color: plColor, note: _fxNote },
  ];
  document.getElementById('kpis').innerHTML = kpis.map(k =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value"${k.color ? ` style="color:${k.color}"` : ''}>${k.value}${k.unit ? ` <span class="unit">${k.unit}</span>` : ''}</div>${k.note ? `<div class="kpi-note" style="font-size:11px;color:var(--muted);margin-top:2px;">${k.note}</div>` : ''}</div>`).join('');
  document.getElementById('dashSub').textContent =
    `${payload.trade_count || trades.length} รายการ จาก ${payload.file_count || '?'} ไฟล์ · ช่วง ${dmy(dates[0])} – ${dmy(dates[dates.length - 1])}`;
  document.getElementById('dashFoot').textContent =
    `อัปเดตข้อมูลเมื่อ ${payload.generated_at || '-'}` + (payload.source_folder ? ` · ที่มา: ${payload.source_folder}` : '');

  // Monthly invested
  const monthly = {};
  trades.filter(isBuy).forEach(t => { if (t.iso_date) { const m = t.iso_date.slice(0, 7); monthly[m] = (monthly[m] || 0) + (t.total_thb || 0); } });
  const months = Object.keys(monthly).sort();
  Highcharts.chart('chartMonthly', {
    chart: { type: 'column', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    xAxis: { categories: months.map(m => { const [y, mm] = m.split('-'); return `${mm}/${y.slice(2)}`; }), labels: { style: { color: C('--text2'), fontSize: '11px' } }, lineColor: C('--border-light') },
    yAxis: { title: { text: null }, labels: { style: { color: C('--text2') } }, gridLineColor: C('--border-light') },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, valueSuffix: ' THB', valueDecimals: 0 },
    plotOptions: { column: { color: C('--primary'), borderRadius: 3 } },
    series: [{ name: 'เงินลงทุน', data: months.map(m => Math.round(monthly[m] * 100) / 100) }],
    legend: { enabled: false }, credits: { enabled: false }
  });

  // Allocation pie
  const alloc = {};
  trades.filter(isBuy).forEach(t => { alloc[t.security] = (alloc[t.security] || 0) + (t.total_thb || 0); });
  const allocArr = Object.entries(alloc).map(([name, y]) => ({ name, y: Math.round(y * 100) / 100 })).sort((a, b) => b.y - a.y);
  const topN = allocArr.slice(0, 10);
  const other = allocArr.slice(10).reduce((a, x) => a + x.y, 0);
  if (other > 0) topN.push({ name: 'อื่นๆ', y: Math.round(other * 100) / 100 });
  const palette = ['--primary', '--info', '--success', '--warning', '--error', '--primary-light'].map(C);
  Highcharts.chart('chartAlloc', {
    chart: { type: 'pie', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, pointFormat: '<b>{point.y:,.0f} THB</b> ({point.percentage:.1f}%)' },
    plotOptions: { pie: { innerSize: '55%', dataLabels: { enabled: true, format: '{point.name}', style: { color: C('--text2'), fontSize: '11px' }, distance: 12 } } },
    series: [{ name: 'สัดส่วน', data: topN }],
    colors: [...palette, '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#64748b'],
    credits: { enabled: false }
  });

  // Cumulative invested
  const byDate = {};
  trades.filter(isBuy).forEach(t => { if (t.iso_date) byDate[t.iso_date] = (byDate[t.iso_date] || 0) + (t.total_thb || 0); });
  let cum = 0; const cumData = Object.keys(byDate).sort().map(d => { cum += byDate[d]; return [Date.parse(d), Math.round(cum * 100) / 100]; });
  Highcharts.chart('chartCumulative', {
    chart: { type: 'area', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    xAxis: { type: 'datetime', labels: { style: { color: C('--text2'), fontSize: '11px' }, format: '{value:%m/%y}' }, lineColor: C('--border-light') },
    yAxis: { title: { text: null }, labels: { style: { color: C('--text2') } }, gridLineColor: C('--border-light') },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, xDateFormat: '%d/%m/%Y', valueSuffix: ' THB', valueDecimals: 0 },
    plotOptions: { area: { color: C('--primary'), fillOpacity: 0.15, marker: { enabled: false }, lineWidth: 2 } },
    series: [{ name: 'เงินลงทุนสะสม', data: cumData }],
    legend: { enabled: false }, credits: { enabled: false }
  });

  // Asset class pie
  const clsAgg = {};
  trades.filter(isBuy).forEach(t => { const k = {offshore:'Offshore (หุ้นต่างประเทศ)', mutual_fund:'Mutual Fund (กองทุนรวม)', gold:'Gold (ทองคำ)'}[t.asset_class] || t.asset_class; clsAgg[k] = (clsAgg[k] || 0) + (t.total_thb || 0); });
  Highcharts.chart('chartClass', {
    chart: { type: 'pie', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, pointFormat: '<b>{point.y:,.0f} THB</b> ({point.percentage:.1f}%)' },
    plotOptions: { pie: { innerSize: '55%', dataLabels: { enabled: true, format: '{point.name}: {point.percentage:.0f}%', style: { color: C('--text2'), fontSize: '11px' }, distance: 12 } } },
    series: [{ name: 'สัดส่วน', data: Object.entries(clsAgg).map(([name, y]) => ({ name, y: Math.round(y * 100) / 100 })) }],
    colors: [C('--primary'), C('--info')],
    credits: { enabled: false }
  });

  // By custom type (from Classify tab) — buy value grouped by DL.typeOf(security)
  const typeAgg = {};
  trades.filter(isBuy).forEach(t => {
    const ty = DL.typeOf(t.security) || 'Unclassified';
    typeAgg[ty] = (typeAgg[ty] || 0) + (t.total_thb || 0);
  });
  const typeArr = Object.entries(typeAgg).map(([name, y]) => ({ name, y: Math.round(y * 100) / 100 })).sort((a, b) => b.y - a.y);
  const typePalette = ['--primary', '--info', '--success', '--warning', '--error', '--primary-light'].map(C).concat(['#8b5cf6', '#ec4899', '#06b6d4']);
  Highcharts.chart('chartType', {
    chart: { type: 'pie', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, pointFormat: '<b>{point.y:,.0f} THB</b> ({point.percentage:.1f}%)' },
    plotOptions: { pie: { innerSize: '55%', dataLabels: { enabled: true, format: '{point.name}: {point.percentage:.0f}%', style: { color: C('--text2'), fontSize: '11px' }, distance: 12 } } },
    series: [{ name: 'สัดส่วน', data: typeArr }],
    colors: typePalette,
    credits: { enabled: false }
  });
  Highcharts.chart('chartTypeBar', {
    chart: { type: 'bar', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    xAxis: { categories: typeArr.map(x => x.name), labels: { style: { color: C('--text2'), fontSize: '11px' } }, lineColor: C('--border-light') },
    yAxis: { title: { text: null }, labels: { style: { color: C('--text2') } }, gridLineColor: C('--border-light') },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, valueSuffix: ' THB', valueDecimals: 0 },
    plotOptions: { bar: { color: C('--primary'), borderRadius: 3, dataLabels: { enabled: true, format: '{point.y:,.0f}', style: { color: C('--text2'), fontWeight: '400' } } } },
    series: [{ name: 'เงินลงทุน', data: typeArr.map(x => x.y) }],
    legend: { enabled: false }, credits: { enabled: false }
  });

  // ---- Dividend by month (column, USD) ----
  const divMonths = Object.keys(divByMonth).sort();
  Highcharts.chart('chartDiv', {
    chart: { type: 'column', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
    title: { text: null },
    xAxis: { categories: divMonths.map(m => { const [y, mm] = m.split('-'); return `${mm}/${y.slice(2)}`; }), labels: { style: { color: C('--text2'), fontSize: '11px' } }, lineColor: C('--border-light') },
    yAxis: { title: { text: null }, labels: { style: { color: C('--text2') } }, gridLineColor: C('--border-light') },
    tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, valuePrefix: '$', valueDecimals: 2 },
    plotOptions: { column: { color: C('--success'), borderRadius: 3 } },
    series: [{ name: 'ปันผล (gross)', data: divMonths.map(m => Math.round(divByMonth[m] * 100) / 100) }],
    legend: { enabled: false }, credits: { enabled: false }
  });

  // ---- P/L by security (bar, green/red) ----
  if (plBySym.length) {
    Highcharts.chart('chartPL', {
      chart: { type: 'bar', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
      title: { text: null },
      xAxis: { categories: plBySym.map(x => x.sym), labels: { style: { color: C('--text2'), fontSize: '11px' } }, lineColor: C('--border-light') },
      yAxis: { title: { text: null }, labels: { style: { color: C('--text2') } }, gridLineColor: C('--border-light'), plotLines: [{ value: 0, color: C('--border'), width: 1 }] },
      tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, formatter: function () { const r = plBySym[this.point.index]; return `<b>${r.sym}</b><br/>${r.pl >= 0 ? '+' : ''}${Highcharts.numberFormat(r.pl, 2)} ${r.ccy}`; } },
      plotOptions: { bar: { borderRadius: 2, dataLabels: { enabled: true, formatter: function () { return (this.y >= 0 ? '+' : '') + Highcharts.numberFormat(this.y, 0); }, style: { color: C('--text2'), fontWeight: '400' } } } },
      series: [{ name: 'กำไร/ขาดทุน', data: plBySym.map(x => ({ y: x.pl, color: x.pl >= 0 ? C('--success') : (C('--error') || '#d33') })) }],
      legend: { enabled: false }, credits: { enabled: false }
    });
  } else {
    document.getElementById('chartPL').innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--muted);font-size:13px;text-align:center;padding:20px;">ยังไม่มีราคาปัจจุบัน<br>ใส่ราคาในหน้า Holdings เพื่อดูกำไร/ขาดทุน</div>';
  }
});
