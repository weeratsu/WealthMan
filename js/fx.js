/* WealthMan — FX Rates panel (USD→THB รายวัน)
   seed จาก data/fx.js (window.INV_FX.rates) + ผู้ใช้กรอก/Import ทับใน localStorage (dimelog_fx)
   ใช้แปลงรายการสกุล USD ที่ไม่มีเรทในตัว — ระบบเลือกเรท "วันใกล้สุด" (ดู DL.fxRate) */
DL.register('fx', function () {
  const dmy = DL.dmy;
  const FX_KEY = 'dimelog_fx';
  const seed = () => { try { return (window.INV_FX && window.INV_FX.rates) || {}; } catch (e) { return {}; } };
  // เรทจริงจาก trx (fx_thb_usd) — ชั้นฐาน (seed/กรอกเองทับได้)
  const fromTrx = () => {
    const o = {};
    try { ((DL.payload && DL.payload.trades) || []).forEach(t => { if (t.fx_thb_usd != null && t.fx_thb_usd !== '' && t.iso_date) o[t.iso_date] = +t.fx_thb_usd; }); } catch (e) {}
    return o;
  };
  const loadUser = () => { try { return JSON.parse(localStorage.getItem(FX_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const saveUser = (m) => { try { localStorage.setItem(FX_KEY, JSON.stringify(m || {})); } catch (e) {} };

  const bodyEl = document.getElementById('fxBody');
  const countEl = document.getElementById('fxCount');

  function render() {
    const tx = fromTrx(), s = seed(), u = loadUser();
    const all = Object.assign({}, tx, s, u);   // ลำดับทับ: trx < seed < user
    const dates = Object.keys(all).sort().reverse();   // ใหม่→เก่า
    countEl.textContent = `${dates.length} days`;
    bodyEl.innerHTML = dates.map(d => {
      const fromUser = u[d] != null;
      const src = fromUser ? '<span class="chip">manual</span>'
        : (s[d] != null ? '<span class="chip" style="opacity:.6">seed</span>'
        : '<span class="chip" style="opacity:.6">from trx</span>');
      const del = fromUser ? `<button class="btn secondary" data-del="${d}" style="padding:2px 8px;">Delete</button>` : '';
      return `<tr><td>${dmy(d)}</td><td class="r" style="font-family:var(--mono)">${Number(all[d]).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4})}</td><td>${src}</td><td>${del}</td></tr>`;
    }).join('');
    bodyEl.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
      const u2 = loadUser(); delete u2[b.dataset.del]; saveUser(u2); render(); afterChange();
    }));
    renderChart(all);
  }

  // กราฟเส้นเทรนด์ค่าเงิน USD/THB (เรียงตามวันที่)
  function renderChart(all) {
    const el = document.getElementById('fxChart');
    if (!el || typeof Highcharts === 'undefined') return;
    const C = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
    const data = Object.keys(all).sort().map(d => [Date.parse(d), +all[d]]);
    // force English month/date labels (default locale may render Thai)
    Highcharts.setOptions({ lang: {
      months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
      shortMonths: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      weekdays: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    } });
    // linear least-squares trend line over the points (faint, straight)
    let trend = [];
    if (data.length >= 2) {
      const n = data.length;
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      data.forEach(([x, y]) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
      const denom = (n * sxx - sx * sx);
      if (denom !== 0) {
        const m = (n * sxy - sx * sy) / denom, b = (sy - m * sx) / n;
        const x0 = data[0][0], x1 = data[n - 1][0];
        trend = [[x0, m * x0 + b], [x1, m * x1 + b]];
      }
    }
    const accent = C('--primary') || C('--accent') || '#9333ea';
    Highcharts.chart('fxChart', {
      chart: { type: 'line', backgroundColor: 'transparent', style: { fontFamily: C('--font') } },
      title: { text: null }, credits: { enabled: false }, legend: { enabled: false },
      xAxis: { type: 'datetime', dateTimeLabelFormats: { day: '%e %b', week: '%e %b', month: "%b '%y", year: '%Y' }, labels: { style: { color: C('--text2'), fontSize: '11px' } }, lineColor: C('--border-light') },
      yAxis: { title: { text: 'THB/USD', style: { color: C('--text2') } }, labels: { style: { color: C('--text2') } }, gridLineColor: C('--border-light'), startOnTick: false, endOnTick: false, softThreshold: false },
      tooltip: { valueDecimals: 4, valueSuffix: ' THB/USD', xDateFormat: '%d/%m/%Y' },
      series: [
        { name: 'Trend', data: trend, type: 'line', color: accent, opacity: 0.28, dashStyle: 'Dash', lineWidth: 2, enableMouseTracking: false, marker: { enabled: false }, zIndex: 1 },
        { name: 'USD/THB', data: data, type: 'areaspline', color: accent, lineWidth: 2.5, zIndex: 2, threshold: null,
          marker: { radius: 2, fillColor: accent },
          fillColor: { linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 }, stops: [[0, Highcharts.color(accent).setOpacity(0.25).get('rgba')], [1, Highcharts.color(accent).setOpacity(0).get('rgba')]] } },
      ],
    });
  }

  // การ reset ให้หน้าอื่น re-render จัดการใน app.js show() ตอน "ออกจากแท็บ FX"
  // (rendered flags เป็น private ใน app.js — pattern เดียวกับ Classify/Holdings)
  function afterChange() { /* no-op: ดู app.js show() leaving-fx branch */ }

  document.getElementById('btnFxAdd').addEventListener('click', () => {
    const d = document.getElementById('fxDate').value;
    const v = parseFloat(document.getElementById('fxVal').value);
    if (!d) { alert('Please select a date first'); return; }
    if (!(v > 0)) { alert('Enter a valid rate'); return; }
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
        alert('Imported ' + n + ' rate(s) successfully');
      } catch (e) { alert('Import failed: ' + e.message); }
      ev.target.value = '';
    };
    rd.readAsArrayBuffer(file);
  }

  document.getElementById('btnFxTemplate').addEventListener('click', template);
  document.getElementById('btnFxImport').addEventListener('click', () => document.getElementById('fxImportFile').click());
  document.getElementById('fxImportFile').addEventListener('change', importXlsx);

  render();
});
