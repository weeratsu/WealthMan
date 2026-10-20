/* DimeLog — Analysis panel: performance / ปันผล / total return ต่อหลักทรัพย์
 * Top/Worst performer (%), Dividend yield ต่อตัว, Yield on cost + แนวโน้มปันผล, Total return (ราคา+ปันผล)
 * ใช้ loader เดียวกับ Holdings (ราคา localStorage+seed) และ Dividends (INV_DIVIDENDS + import)
 * เคารพ privacy mode: ซ่อนจำนวนเงิน แต่โชว์ %
 */
DL.register('analysis', function (payload) {
  const C = DL.C, fmt = DL.fmt, money = DL.money, dmy = DL.dmy;
  const trades = (payload.trades || []);
  const BUY = { BUY: 1, SUB: 1, SWI: 1 }, SELL = { SEL: 1, RED: 1, SWO: 1 };
  const PRIV = DL.isPrivate();

  function loadPrices() {
    const seed = Object.assign({}, (window.DIME_PRICES && window.DIME_PRICES.prices) || {});
    try { Object.assign(seed, JSON.parse(localStorage.getItem('dimelog_prices') || '{}') || {}); } catch (e) {}
    return seed;
  }
  function loadDivs() {
    const base = ((window.INV_DIVIDENDS && window.INV_DIVIDENDS.dividends) || []).slice();
    let imp = []; try { imp = JSON.parse(localStorage.getItem('dimelog_dividends_import') || '[]') || []; } catch (e) {}
    const map = {};
    base.concat(imp).forEach(d => { if (d.security && d.security !== '(TAF Fee)') map[d.security + '|' + d.pay_date] = d; });
    return Object.values(map);
  }

  const prices = loadPrices();
  const divs = loadDivs();

  // positions
  const pos = {};
  trades.forEach(t => {
    const s = t.security || '-';
    const a = pos[s] || (pos[s] = { sym: s, ccy: '', units: 0, inv: 0 });
    if (t.ccy) a.ccy = t.ccy;
    const native = (t.ccy === 'USD') ? (t.total_usd || 0) : (t.total_thb || 0);
    if (BUY[t.type]) { a.units += (t.units || 0); a.inv += native; }
    else if (SELL[t.type]) { a.units -= (t.units || 0); a.inv -= native; }
  });
  // dividends per sym + by month
  const dsum = {}, divByMonth = {};
  divs.forEach(d => {
    const s = d.security, g = +d.gross_usd || 0, net = g - (+d.wht_usd || 0) - (+d.fee_usd || 0);
    (dsum[s] = dsum[s] || { gross: 0, net: 0, n: 0 }); dsum[s].gross += g; dsum[s].net += net; dsum[s].n++;
    const m = (d.pay_date || '').slice(0, 7); if (m) divByMonth[m] = (divByMonth[m] || 0) + g;
  });

  // build rows (held only)
  const rows = [];
  Object.values(pos).forEach(a => {
    if (a.units <= 0.0000001) return;
    const p = prices[a.sym];
    const price = (p == null || p === '' || isNaN(+p)) ? null : +p;
    const mkt = price != null ? price * (a.units / DL.priceDivisor(a.sym)) : null;
    const pl = mkt != null ? mkt - a.inv : null;
    const plpct = (pl != null && a.inv) ? pl / a.inv * 100 : null;
    const dv = dsum[a.sym] || { gross: 0, net: 0, n: 0 };
    const yoc = (a.inv && a.ccy === 'USD') ? dv.gross / a.inv * 100 : null;   // yield on cost (gross, USD only)
    const totret = (a.ccy === 'USD' && mkt != null) ? (pl + dv.gross) : null; // total return native (price p/l + dividends)
    const totretpct = (totret != null && a.inv) ? totret / a.inv * 100 : null;
    rows.push({ sym: a.sym, ccy: a.ccy, units: a.units, inv: a.inv, price, mkt, pl, plpct,
      divg: dv.gross, divn: dv.net, divN: dv.n, yoc, totret, totretpct, type: DL.typeOf(a.sym) || '' });
  });

  const priced = rows.filter(r => r.plpct != null);
  const withDiv = rows.filter(r => r.divg > 0);

  // ---------- KPIs ----------
  const kpiEl = document.getElementById('anKpis');
  const totDivGross = Object.values(dsum).reduce((s, d) => s + d.gross, 0);
  const totInvUsd = rows.filter(r => r.ccy === 'USD').reduce((s, r) => s + r.inv, 0);
  const portYoc = totInvUsd ? totDivGross / totInvUsd * 100 : null;
  const best = priced.slice().sort((a, b) => b.plpct - a.plpct)[0];
  const worst = priced.slice().sort((a, b) => a.plpct - b.plpct)[0];
  const card = (label, val, unit, color) => `<div class="kpi"><div class="label">${label}</div><div class="value"${color ? ` style="color:${color}"` : ''}>${val}${unit ? ` <span class="unit">${unit}</span>` : ''}</div></div>`;
  kpiEl.innerHTML =
    card('ปันผลรับรวม', money(totDivGross, 2), 'USD', 'var(--success)') +
    card('Yield on cost (พอร์ต USD)', portYoc != null ? fmt(portYoc, 2) : '—', '%') +
    card('ตัวที่ดีสุด', best ? `${best.sym} ${best.plpct >= 0 ? '+' : ''}${fmt(best.plpct, 1)}%` : '—', '', best && best.plpct >= 0 ? 'var(--success)' : 'var(--error,#d33)') +
    card('ตัวที่แย่สุด', worst ? `${worst.sym} ${worst.plpct >= 0 ? '+' : ''}${fmt(worst.plpct, 1)}%` : '—', '', worst && worst.plpct < 0 ? 'var(--error,#d33)' : '');

  const sub = document.getElementById('anSub');
  if (sub) sub.textContent = `${rows.length} หลักทรัพย์ที่ถืออยู่ · ใส่ราคาแล้ว ${priced.length} · จ่ายปันผล ${withDiv.length}`;

  // ---------- 1) Performance bar (P/L %) ----------
  const perf = priced.slice().sort((a, b) => b.plpct - a.plpct);
  if (perf.length) {
    Highcharts.chart('anPerf', {
      chart: { type: 'bar', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
      title: { text: null },
      xAxis: { categories: perf.map(r => r.sym), labels: { style: { color: C('--text2'), fontSize: '11px' } }, lineColor: C('--border-light') },
      yAxis: { title: { text: null }, labels: { style: { color: C('--text2') }, format: '{value}%' }, gridLineColor: C('--border-light'), plotLines: [{ value: 0, color: C('--border'), width: 1 }] },
      tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, formatter: function () { return `<b>${perf[this.point.index].sym}</b><br/>${this.y >= 0 ? '+' : ''}${Highcharts.numberFormat(this.y, 1)}%`; } },
      plotOptions: { bar: { borderRadius: 2, dataLabels: { enabled: true, formatter: function () { return (this.y >= 0 ? '+' : '') + Highcharts.numberFormat(this.y, 1) + '%'; }, style: { color: C('--text2'), fontWeight: '400' } } } },
      series: [{ name: 'กำไร/ขาดทุน %', data: perf.map(r => ({ y: Math.round(r.plpct * 10) / 10, color: r.plpct >= 0 ? C('--success') : (C('--error') || '#d33') })) }],
      legend: { enabled: false }, credits: { enabled: false }
    });
  } else {
    document.getElementById('anPerf').innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--muted);font-size:13px;text-align:center;padding:20px;">ยังไม่มีราคาปัจจุบัน<br>ใส่ราคาในหน้า Holdings ก่อน</div>';
  }

  // ---------- 2) Dividend yield on cost bar (USD, gross) ----------
  const yocRows = rows.filter(r => r.yoc != null && r.divg > 0).sort((a, b) => b.yoc - a.yoc);
  if (yocRows.length) {
    Highcharts.chart('anYoc', {
      chart: { type: 'bar', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
      title: { text: null },
      xAxis: { categories: yocRows.map(r => r.sym), labels: { style: { color: C('--text2'), fontSize: '11px' } }, lineColor: C('--border-light') },
      yAxis: { title: { text: null }, labels: { style: { color: C('--text2') }, format: '{value}%' }, gridLineColor: C('--border-light') },
      tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, formatter: function () { const r = yocRows[this.point.index]; return `<b>${r.sym}</b><br/>Yield on cost: ${Highcharts.numberFormat(r.yoc, 2)}%<br/>ปันผลรับ: ${PRIV ? '•••••' : '$' + Highcharts.numberFormat(r.divg, 2)}`; } },
      plotOptions: { bar: { color: C('--success'), borderRadius: 2, dataLabels: { enabled: true, formatter: function () { return Highcharts.numberFormat(this.y, 2) + '%'; }, style: { color: C('--text2'), fontWeight: '400' } } } },
      series: [{ name: 'Yield on cost', data: yocRows.map(r => Math.round(r.yoc * 100) / 100) }],
      legend: { enabled: false }, credits: { enabled: false }
    });
  } else {
    document.getElementById('anYoc').innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--muted);font-size:13px;padding:20px;">ยังไม่มีข้อมูลปันผล</div>';
  }

  // ---------- 3) Dividend trend (monthly, gross USD) ----------
  const dmonths = Object.keys(divByMonth).sort();
  if (dmonths.length) {
    Highcharts.chart('anDivTrend', {
      chart: { type: 'column', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
      title: { text: null },
      xAxis: { categories: dmonths.map(m => { const [y, mm] = m.split('-'); return `${mm}/${y.slice(2)}`; }), labels: { style: { color: C('--text2'), fontSize: '10px' } }, lineColor: C('--border-light') },
      yAxis: { title: { text: null }, labels: { style: { color: C('--text2') } }, gridLineColor: C('--border-light') },
      tooltip: { backgroundColor: C('--surface'), borderColor: C('--border'), style: { color: C('--text') }, valuePrefix: '$', valueDecimals: 2 },
      plotOptions: { column: { color: C('--success'), borderRadius: 2 } },
      series: [{ name: 'ปันผล (gross)', data: dmonths.map(m => Math.round(divByMonth[m] * 100) / 100) }],
      legend: { enabled: false }, credits: { enabled: false }
    });
  } else {
    document.getElementById('anDivTrend').innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--muted);font-size:13px;padding:20px;">ยังไม่มีข้อมูลปันผล</div>';
  }

  // ---------- 4) Total return table (price P/L + dividends) ----------
  const trRows = rows.slice().sort((a, b) => {
    const ax = a.totretpct == null ? -Infinity : a.totretpct, bx = b.totretpct == null ? -Infinity : b.totretpct;
    return bx - ax;
  });
  const plColor = v => v == null ? 'var(--text)' : v > 0 ? 'var(--success)' : v < 0 ? 'var(--error,#d33)' : 'var(--text)';
  const pct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${fmt(v, 1)}%`;
  document.getElementById('anTotBody').innerHTML = trRows.map(r => `<tr>
    <td class="yr">${r.sym}</td>
    <td style="text-align:left;font-family:var(--font)">${r.type || '<span style="color:var(--muted)">—</span>'}</td>
    <td>${r.ccy}</td>
    <td>${money(r.inv, 2)}</td>
    <td style="color:${plColor(r.plpct)}">${pct(r.plpct)}</td>
    <td style="color:var(--success)">${money(r.divg, 2)}</td>
    <td>${r.yoc != null ? fmt(r.yoc, 2) + '%' : '—'}</td>
    <td style="color:${plColor(r.totretpct)}"><b>${pct(r.totretpct)}</b></td>
  </tr>`).join('');
});
