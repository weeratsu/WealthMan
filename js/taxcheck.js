/* WealthMan — Offshore Tax Check (ภาษีหุ้นนอก): แบบสอบถาม + สรุปเคส ตามคำสั่ง ป.161/ป.162 (Oct 31 2026) */
DL.register('taxcheck', function () {
  const fmt = DL.fmt, money = DL.money, isBuy = DL.isBuy, isSell = DL.isSell;
  const KEY = 'dimelog_taxcheck';
  let Q = {}; try { Q = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Q)); } catch (e) {} };
  const fxMap = DL.loadFx();
  const thb = (usd, iso) => { const v = DL.usdToThb(usd, iso, fxMap); return v == null ? null : v; };

  // ---------- 1) realized gain per SELL (average cost, offshore only) ----------
  const trades = DL.allTrades().filter(t => t.asset_class === 'offshore').slice()
    .sort((a, b) => (a.iso_date || '').localeCompare(b.iso_date || ''));
  const pos = {};               // security -> {units, cost_thb}
  const sells = [];             // {date, sec, units, proceeds, cost, gain}
  let missingFx = 0;
  trades.forEach(t => {
    const s = t.security || '-'; const p = (pos[s] = pos[s] || { units: 0, cost: 0 });
    let amt = t.total_thb; if (amt == null && t.total_usd != null) { amt = thb(t.total_usd, t.iso_date); }
    if (amt == null) { missingFx++; return; }
    if (isBuy(t)) { p.units += (t.units || 0); p.cost += amt; }
    else if (isSell(t)) {
      const u = t.units || 0; const avg = p.units > 0 ? p.cost / p.units : 0; const cost = avg * u;
      sells.push({ date: t.iso_date, sec: s, units: u, proceeds: amt, cost: cost, gain: amt - cost });
      p.units -= u; p.cost -= cost; if (p.units < 1e-9) { p.units = 0; p.cost = 0; }
    }
  });

  // ---------- 2) dividends per year (THB at pay-date rate) ----------
  const divs = (function () {
    const base = ((window.INV_DIVIDENDS && window.INV_DIVIDENDS.dividends) || []).slice();
    let imp = []; try { imp = JSON.parse(localStorage.getItem('dimelog_dividends_import') || '[]') || []; } catch (e) {}
    const m = {}; base.concat(imp).forEach(d => { if (d.security && d.security !== '(TAF Fee)') m[d.security + '|' + d.pay_date] = d; });
    return Object.values(m);
  })();
  const Y = {};
  const yr = y => (Y[y] = Y[y] || { gain: 0, loss: 0, nSell: 0, divG: 0, divW: 0, nDiv: 0 });
  sells.forEach(s => { const r = yr(s.date.slice(0, 4)); r.nSell++; if (s.gain > 0) r.gain += s.gain; else r.loss += s.gain; });
  divs.forEach(d => { const y = (d.pay_date || '').slice(0, 4); if (!y) return; const r = yr(y);
    const g = thb(+d.gross_usd || 0, d.pay_date), w = thb(+d.wht_usd || 0, d.pay_date); r.nDiv++; r.divG += (g || 0); r.divW += (w || 0); });
  const thisY = new Date().getFullYear();
  const years = []; for (let y = 2024; y <= thisY; y++) years.push(String(y));
  Object.keys(Y).forEach(y => { if (years.indexOf(y) < 0) years.push(y); }); years.sort();

  // ---------- 3) per-year verdict ----------
  // income ARISES in year y only if (y>=2024 && days>=180). Taxed in the year it is REMITTED.
  let pool = 0;  // assessable income not yet remitted (carried)
  const out = years.map(y => {
    const r = Y[y] || { gain: 0, loss: 0, nSell: 0, divG: 0, divW: 0, nDiv: 0 };
    const q = Q[y] || {}; const days = q.days; const res = days === 'yes';
    const pre = +y < 2024;
    const arises = !pre && res ? (r.gain + r.divG) : 0;
    const exempt = (pre || days === 'no') ? (r.gain + r.divG) : 0;
    pool += arises;
    const rem = +q.remit || 0;                       // THB brought into Thailand this year (all money)
    const maxAssess = Math.min(rem, pool);           // worst case: remittance counted as income first
    pool -= maxAssess;
    return { y, r, days, res, pre, arises, exempt, rem, maxAssess, poolAfter: pool, credit: res ? r.divW : 0 };
  });

  // ---------- render ----------
  const host = document.getElementById('taxcheckBody'); if (!host) return;
  const rb = (y, v, val) => `<td style="text-align:center"><input type="radio" class="tc-rb" name="days_${y}" value="${val}" data-y="${y}" data-f="days"${v === val ? ' checked' : ''}></td>`;
  const yn = (y, v) => rb(y, v, 'yes') + rb(y, v, 'no');
  const qRows = out.map(o => `<tr><td class="yr">${o.y}${o.pre ? ' <span class="hint">(ก่อน 2567)</span>' : ''}</td>${yn(o.y, o.days)}<td><input class="inp" style="width:130px;text-align:right" inputmode="decimal" data-y="${o.y}" data-f="remit" value="${o.rem || ''}" placeholder="0"></td></tr>`).join('');
  const verdict = o => {
    if (o.pre) return '<span style="color:var(--success)">✅ เงินได้ก่อน 1 ม.ค. 2567 — ยกเว้น (ป.162)</span>';
    if (!o.days) return '<span style="color:var(--warn,#d97706)">❓ ตอบจำนวนวันที่อยู่ไทยก่อน</span>';
    if (!o.res) return '<span style="color:var(--success)">✅ ปีนี้ไม่ใช่ผู้อยู่ไทย — กำไร/ปันผลที่เกิดปีนี้ไม่ต้องเสีย แม้โอนกลับภายหลัง</span>';
    if (o.maxAssess > 0) return `<span style="color:var(--danger)">🧾 ปีนี้นำเงินเข้าไทย — อาจต้องรวมเงินได้สูงสุด ฿${money(o.maxAssess, 0)} ใน ภ.ง.ด.90 ปี ${o.y}</span>`;
    if (o.arises > 0) return `<span style="color:var(--primary,#2563eb)">📌 มีเงินได้เกิด ฿${money(o.arises, 0)} — ยังไม่ต้องยื่นจนกว่าจะโอนกลับไทย (จดไว้)</span>`;
    return '<span class="hint">— ไม่มีเงินได้ต่างประเทศในปีนี้</span>';
  };
  const sumRows = out.map(o => `<tr><td class="yr">${o.y}</td><td>${o.r.nSell}</td><td style="color:var(--success)">${o.r.gain ? money(o.r.gain, 0) : '—'}</td><td style="color:var(--danger)">${o.r.loss ? money(o.r.loss, 0) : '—'}</td><td>${o.r.divG ? money(o.r.divG, 0) : '—'}</td><td>${o.r.divW ? money(o.r.divW, 0) : '—'}</td><td>${o.arises ? money(o.arises, 0) : '—'}</td><td>${o.rem ? money(o.rem, 0) : '—'}</td><td style="font-weight:700">${o.maxAssess ? money(o.maxAssess, 0) : '—'}</td><td>${money(o.poolAfter, 0)}</td></tr><tr><td></td><td colspan="9" style="text-align:left;font-family:var(--font);font-size:12px">${verdict(o)}${o.credit && o.maxAssess ? ` · เครดิตภาษี US ที่ถูกหัก ≈ ฿${money(o.credit, 0)}` : ''}</td></tr>`).join('');
  const sellRows = sells.slice().reverse().map(s => `<tr><td>${DL.dmy ? DL.dmy(s.date) : s.date}</td><td class="yr">${s.sec}</td><td>${fmt(s.units, 6)}</td><td>${money(s.proceeds)}</td><td>${money(s.cost)}</td><td style="color:${s.gain >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(s.gain)}</td></tr>`).join('') || '<tr><td colspan="6" class="hint">ยังไม่มีรายการขายหุ้นนอก</td></tr>';
  const answered = out.filter(o => !o.pre).every(o => o.days);
  const due = out.filter(o => o.maxAssess > 0);
  const top = !answered ? '<div class="warn">ตอบแบบสอบถามด้านล่างให้ครบทุกปี แล้วระบบจะสรุปเคสของคุณให้</div>' :
    (due.length ? `<div class="warn">🧾 <b>คุณมีปีที่อาจต้องยื่น:</b> ${due.map(o => `ปี ${o.y} (≤฿${money(o.maxAssess, 0)})`).join(', ')} — รวมใน ภ.ง.ด.90 ของปีนั้น และใช้เครดิตภาษี US ที่ถูกหักได้</div>` :
      `<div class="note">✅ <b>ตอนนี้ยังไม่มีปีที่ต้องยื่นภาษีหุ้นนอก</b> เพราะยังไม่ได้นำเงินได้เข้าไทย · เงินได้สะสมที่ยังไม่โอนกลับ ≈ ฿${money(pool, 0)} — ถ้าโอนกลับเมื่อไหร่ ต้องรวมในปีที่โอน</div>`);
  host.innerHTML =
    top +
    `<div class="card"><h2>1) แบบสอบถาม (ตอบรายปี)</h2><div class="hint" style="margin-bottom:8px">ข้อ A: ปีนั้นคุณอยู่ไทยรวม ≥180 วันไหม (นับ 1 ม.ค.–31 ธ.ค. รวมหลายช่วงได้) · ข้อ B: ปีนั้นโอนเงินจากบัญชี/พอร์ตต่างประเทศ <b>เข้าไทย</b> รวมเท่าไหร่ (บาท, ทั้งต้น+กำไร) — ใส่ 0 ถ้าไม่ได้โอน</div>
      <table class="rpt"><thead><tr><th>ปี</th><th style="text-align:center">A: ≥180 วัน<br><button class="btn secondary" data-all="yes" style="padding:1px 8px;font-size:11px">ทุกปี</button></th><th style="text-align:center">ไม่ถึง 180 วัน<br><button class="btn secondary" data-all="no" style="padding:1px 8px;font-size:11px">ทุกปี</button></th><th>B: โอนเข้าไทย (฿)</th></tr></thead><tbody>${qRows}</tbody></table></div>` +
    `<div class="card"><h2>2) สรุปเคสรายปี (THB)</h2><div class="hint" style="margin-bottom:8px">กำไรคิดรายธุรกรรมแบบต้นทุนเฉลี่ย · ขาดทุนแสดงไว้ดูแต่ไม่นำมาหักลบ · ปันผลแปลงด้วยเรทวันจ่าย · "อาจต้องรวม" = กรณีระมัดระวัง (ถือว่าเงินที่โอนเข้าเป็นกำไรก่อน) — ถ้าพิสูจน์ได้ว่าเป็นเงินต้นจะน้อยกว่านี้</div>
      <div style="overflow-x:auto"><table class="rpt"><thead><tr><th>ปี</th><th>ขาย</th><th>กำไรขาย</th><th>ขาดทุน (ไม่หัก)</th><th>ปันผล gross</th><th>US WHT</th><th>เงินได้เกิด</th><th>โอนเข้าไทย</th><th>อาจต้องรวม</th><th>ค้างยังไม่โอน</th></tr></thead><tbody>${sumRows}</tbody></table></div></div>` +
    `<div class="card"><h2>3) รายการขาย (กำไรรายธุรกรรม)</h2><div style="overflow-x:auto"><table class="rpt"><thead><tr><th>วันที่ขาย</th><th>หลักทรัพย์</th><th>หน่วย</th><th>รับ (฿)</th><th>ต้นทุนเฉลี่ย (฿)</th><th>กำไร/ขาดทุน (฿)</th></tr></thead><tbody>${sellRows}</tbody></table></div>${missingFx ? `<div class="warn" style="margin-top:6px">⚠️ ${missingFx} รายการไม่มีเรท FX — เพิ่มที่ FX Rates</div>` : ''}</div>` +
    `<div class="note">ข้อมูลเพื่อความเข้าใจเบื้องต้น ไม่ใช่คำแนะนำภาษี · ตัวเลขบาทใช้เรทวันทำรายการ แต่ตอนยื่นจริงสรรพากรให้ใช้เรท <b>ณ วันที่นำเงินเข้าไทย</b> · ดูหลักการเต็มที่ Help › ภาษี</div>`;
  host.querySelectorAll('[data-y]').forEach(el => el.addEventListener('change', () => {
    const y = el.getAttribute('data-y'), f = el.getAttribute('data-f'); Q[y] = Q[y] || {};
    if (el.type === 'radio' && !el.checked) return;
    Q[y][f] = f === 'remit' ? (parseFloat(String(el.value).replace(/,/g, '')) || 0) : el.value; save();
    keepScroll(() => DL.refreshAll());
  }));
  host.querySelectorAll('button[data-all]').forEach(b => b.addEventListener('click', () => {
    out.forEach(o => { if (!o.pre) { Q[o.y] = Q[o.y] || {}; Q[o.y].days = b.dataset.all; } }); save();
    keepScroll(() => DL.refreshAll());
  }));
  // re-render without jumping back to the top
  function keepScroll(fn) {
    const els = [document.scrollingElement, document.querySelector('.main')].filter(Boolean);
    const pos = els.map(e => e.scrollTop);
    fn();
    requestAnimationFrame(() => els.forEach((e, i) => { e.scrollTop = pos[i]; }));
  }
});
