/* DimeLog — Setup wizard (4 steps): install → folder/config → run → done */
DL.register('setup', function () {
  const STEPS = 4;
  let cur = 0;

  const steps = [...document.querySelectorAll('#wzSteps .wz-step')];
  const pages = [0, 1, 2, 3].map(i => document.getElementById('wz-' + i));
  const back = document.getElementById('wzBack');
  const next = document.getElementById('wzNext');

  function paint() {
    pages.forEach((p, i) => p.classList.toggle('active', i === cur));
    steps.forEach((s, i) => {
      s.classList.toggle('active', i === cur);
      s.classList.toggle('done', i < cur);
    });
    back.style.visibility = cur === 0 ? 'hidden' : 'visible';
    next.textContent = cur === STEPS - 1 ? 'เสร็จสิ้น ✓' : 'ถัดไป →';
    if (cur === STEPS - 1) checkData();
  }
  function go(n) { cur = Math.max(0, Math.min(STEPS - 1, n)); paint(); }

  back.onclick = () => go(cur - 1);
  next.onclick = () => { if (cur === STEPS - 1) DL.show('dashboard'); else go(cur + 1); };
  steps.forEach((s, i) => s.addEventListener('click', () => go(i)));
  const goDash = document.getElementById('wzGoDash');
  if (goDash) goDash.onclick = () => DL.show('dashboard');

  // copy buttons
  document.querySelectorAll('#panel-setup .wz-copy').forEach(el => {
    el.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(el.getAttribute('data-copy'));
        const cp = el.querySelector('.cp'); const old = cp.textContent;
        cp.textContent = 'คัดลอกแล้ว ✓'; setTimeout(() => cp.textContent = old, 1500);
      } catch (e) { alert('คัดลอกไม่สำเร็จ'); }
    });
  });

  // ---- step 2: config.json generator ----
  const rootPath = document.getElementById('rootPath');
  const preview = document.getElementById('cfgPreview');
  const previewCode = document.getElementById('cfgPreviewCode');
  const okMsg = document.getElementById('cfgOk');
  const divPath = document.getElementById('divPath');
  const goldPath = document.getElementById('goldPath');
  const archiveChk = document.getElementById('archiveChk');
  const buildConfig = () => {
    const cfg = { root: rootPath.value.trim() };
    const d = (divPath && divPath.value.trim()) || '';
    if (d) cfg.dividend_root = d;   // ใส่เฉพาะเมื่อกรอก (ไม่บังคับ)
    const g = (goldPath && goldPath.value.trim()) || '';
    if (g) cfg.gold_root = g;       // โฟลเดอร์ทอง (ไม่บังคับ)
    if (archiveChk) cfg.archive_after_parse = !!archiveChk.checked;  // ย้ายไฟล์เข้าปี/ชนิดหลัง parse
    return cfg;
  };
  function refresh() {
    const cfg = buildConfig();
    if (cfg.root || cfg.dividend_root || cfg.gold_root) { preview.style.display = 'block'; previewCode.textContent = JSON.stringify(cfg, null, 2); }
    else preview.style.display = 'none';
  }
  rootPath.addEventListener('input', refresh);
  if (divPath) divPath.addEventListener('input', refresh);
  if (goldPath) goldPath.addEventListener('input', refresh);
  if (archiveChk) archiveChk.addEventListener('change', refresh);

  document.getElementById('btnGenCfg').addEventListener('click', async () => {
    const cfg = buildConfig();
    if (!cfg.root) { alert('กรุณากรอก path โฟลเดอร์ก่อน'); return; }
    const text = JSON.stringify(cfg, null, 2);
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'config.json', id: 'dimelog-config', startIn: 'documents',
          types: [{ description: 'JSON config', accept: { 'application/json': ['.json'] } }],
        });
        const w = await handle.createWritable(); await w.write(text); await w.close();
        okMsg.textContent = '✅ บันทึก config.json แล้ว — ถ้าเลือกไว้ที่ scripts\\ รัน run_wealthman.bat ได้เลย';
        okMsg.style.display = 'block'; return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'config.json'; a.click(); URL.revokeObjectURL(url);
    okMsg.textContent = '✅ ดาวน์โหลด config.json แล้ว — ย้ายไปวางใน scripts\\';
    okMsg.style.display = 'block';
  });
  document.getElementById('btnCopyCfg').addEventListener('click', async () => {
    const cfg = buildConfig(); if (!cfg.root) { alert('กรุณากรอก path โฟลเดอร์ก่อน'); return; }
    try { await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2)); alert('คัดลอกเนื้อหา config.json แล้ว'); }
    catch (e) { alert('คัดลอกไม่สำเร็จ'); }
  });

  // ---- step 4: verify data loaded ----
  function checkData() {
    const el = document.getElementById('wzResult');
    const n = (DL.payload.trades || []).length;
    if (n > 0) {
      el.className = 'note'; el.style.borderLeftColor = 'var(--success)';
      el.innerHTML = `✅ พบข้อมูลแล้ว <b>${n}</b> รายการ (${DL.payload.file_count || '?'} ไฟล์) — ติดตั้งสำเร็จ! ไปที่ Dashboard ได้เลย`;
    } else {
      el.className = 'warn';
      el.innerHTML = 'ยังไม่พบข้อมูล — ตรวจว่ารัน <code>run_wealthman.bat</code> แล้ว และมีไฟล์ <code>data/inv_data.js</code> อยู่ (ขั้นที่ 3)';
    }
  }

  // ---------- price-unit divisor ต่อ security ----------
  (function punitUI() {
    const secEl = document.getElementById('punitSec');
    const valEl = document.getElementById('punitVal');
    const bodyEl = document.getElementById('punitBody');
    const countEl = document.getElementById('punitCount');
    if (!secEl || !bodyEl) return;
    const SEED = { 'Gold 96.5%': 15.244 };
    const KEY = 'dimelog_price_unit';
    const loadU = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
    const saveU = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m || {})); } catch (e) {} };
    const secs = () => [...new Set(((DL.payload && DL.payload.trades) || []).map(t => t.security).filter(Boolean))].sort();

    function fill() {
      secEl.innerHTML = secs().map(function (s) {
        return '<option value="' + String(s).replace(/"/g, '&quot;') + '">' + s + '</option>';
      }).join('');
    }
    function render() {
      const all = Object.assign({}, SEED, loadU());
      const u = loadU();
      const keys = Object.keys(all).sort();
      countEl.textContent = keys.length + ' ตั้งค่า';
      if (!keys.length) {
        bodyEl.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted)">ยังไม่มีการตั้งค่า (ค่าปกติ = 1)</td></tr>';
        return;
      }
      var html = '';
      keys.forEach(function (s) {
        var d = all[s];
        var fromUser = u[s] != null;
        var mean = (d === 15.244) ? '1 บาททอง = 15.244 กรัม' : ('ราคา 1 หน่วย = ' + d + ' units');
        var src = fromUser ? '' : ' <span class="chip" style="opacity:.6">seed</span>';
        var esc = String(s).replace(/"/g, '&quot;');
        var delBtn = fromUser ? ('<button class="btn secondary" data-del="' + esc + '" style="padding:2px 8px;">รีเซ็ต</button>') : '';
        html += '<tr><td>' + s + '</td><td class="r" style="font-family:var(--mono)">' + d + src +
                '</td><td style="font-size:12px;color:var(--muted)">' + mean + '</td><td>' + delBtn + '</td></tr>';
      });
      bodyEl.innerHTML = html;
      bodyEl.querySelectorAll('button[data-del]').forEach(function (b) {
        b.addEventListener('click', function () { var u2 = loadU(); delete u2[b.dataset.del]; saveU(u2); render(); });
      });
    }
    document.getElementById('btnPunitSet').addEventListener('click', () => {
      const s = secEl.value; const v = parseFloat(valEl.value);
      if (!s) { alert('เลือกหลักทรัพย์ก่อน'); return; }
      if (!(v > 0)) { alert('ใส่ตัวหารให้ถูกต้อง (> 0)'); return; }
      const u = loadU(); u[s] = v; saveU(u); valEl.value = ''; render();
    });
    fill(); render();
  })();

  // ---------- Profile (birthdate for RMF) ----------
  (function profileUI() {
    const b = document.getElementById('pfBirthdate'); if (!b) return;
    const prof = DL.loadProfile(); if (prof.birthdate) b.value = prof.birthdate;
    const btn = document.getElementById('btnPfSave');
    btn && btn.addEventListener('click', () => {
      const p = DL.loadProfile(); p.birthdate = b.value || ''; DL.saveProfile(p);
      const s = document.getElementById('pfSaved'); if (s) { s.textContent = '✓ บันทึกแล้ว'; s.style.display = ''; setTimeout(() => { s.textContent = ''; s.style.display = 'none'; }, 2000); }
    });
  })();

  // ---------- Asset Class master ----------
  (function classUI() {
    const body = document.getElementById('classBody'); if (!body) return;
    function render() {
      const list = DL.allClasses();
      body.innerHTML = list.map(c => {
        const nm = String(c.label).replace(/"/g, '&quot;');
        const srcChip = c.builtin ? '<span class="chip" style="opacity:.7">ระบบ</span>' : '<span class="chip">เพิ่มเอง</span>';
        const delBtn = c.builtin ? '' : '<button class="btn secondary" data-cl-del="' + c.key + '" style="padding:2px 8px;">ลบ</button>';
        return '<tr>' +
          '<td style="text-align:left;font-family:var(--mono);color:var(--muted);font-size:12px">' + c.key + '</td>' +
          '<td style="text-align:left"><input type="text" data-cl-label="' + c.key + '" value="' + nm + '" style="width:100%;height:30px;border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-family:var(--font);font-size:13px;background:var(--surface);color:var(--text)"></td>' +
          '<td>' + srcChip + '</td>' +
          '<td>' + delBtn + '</td>' +
        '</tr>';
      }).join('');
      body.querySelectorAll('input[data-cl-label]').forEach(inp => inp.addEventListener('change', () => {
        const k = inp.dataset.clLabel, v = (inp.value || '').trim(); if (!v) { render(); return; }
        const m = DL.loadClasses(); m[k] = Object.assign({}, m[k], { label: v }); DL.saveClasses(m); flash(); DL.refreshAll && DL.refreshAll();
      }));
      body.querySelectorAll('button[data-cl-del]').forEach(btn => btn.addEventListener('click', () => {
        const k = btn.dataset.clDel;
        const used = DL.allTrades().some(t => t.asset_class === k);
        if (used && !confirm('ชนิดนี้มีรายการใช้อยู่ — ลบแล้วรายการเหล่านั้นจะแสดง key เดิม ดำเนินต่อ?')) return;
        const m = DL.loadClasses(); delete m[k]; DL.saveClasses(m); render(); DL.refreshAll && DL.refreshAll();
      }));
    }
    function flash() { const s = document.getElementById('clSaved'); if (s) { s.textContent = '✓ บันทึกแล้ว'; s.style.display = ''; setTimeout(() => { s.style.display = 'none'; }, 1500); } }
    const addBtn = document.getElementById('btnClAdd');
    if (addBtn && !addBtn.dataset.bound) { addBtn.dataset.bound = '1'; addBtn.addEventListener('click', () => {
      const kEl = document.getElementById('clNewKey'), lEl = document.getElementById('clNewLabel');
      let k = (kEl.value || '').trim().toLowerCase().replace(/\s+/g, '_'); const lb = (lEl.value || '').trim();
      if (!k) { alert('ใส่ key ก่อน'); return; }
      const m = DL.loadClasses(); if (m[k]) { alert('key นี้มีแล้ว'); return; }
      m[k] = { label: lb || k, builtin: false }; DL.saveClasses(m); kEl.value = ''; lEl.value = ''; render(); flash(); DL.refreshAll && DL.refreshAll();
    }); }
    const rstBtn = document.getElementById('btnClReset');
    if (rstBtn && !rstBtn.dataset.bound) { rstBtn.dataset.bound = '1'; rstBtn.addEventListener('click', () => {
      if (!confirm('คืนค่าเริ่มต้น (ลบ class ที่เพิ่มเองทั้งหมด)?')) return;
      DL.resetClasses(); render(); flash(); DL.refreshAll && DL.refreshAll();
    }); }
    render();
  })();

  // ---------- Fund Rules (sellable conditions) ----------
  (function fundRulesUI() {
    const body = document.getElementById('fundRulesBody'); if (!body) return;
    const BASIS = [['anniversary', 'วันชนวัน'], ['calendar', 'ปีปฏิทิน']];
    function basisSel(k, cur) {
      return '<select data-fr-basis="' + k + '" style="height:30px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:var(--font);font-size:12px;padding:0 6px">' +
        BASIS.map(o => '<option value="' + o[0] + '"' + ((cur || 'anniversary') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    }
    function render() {
      const R = DL.loadFundRules();
      const keys = Object.keys(R);
      body.innerHTML = keys.map(k => {
        const r = R[k] || {};
        const label = r.label || k;
        const hold = (r.holdYears != null) ? r.holdYears : '';
        const age = (r.minAge != null) ? r.minAge : '';
        return '<tr>' +
          '<td style="text-align:left;font-weight:600">' + label + '</td>' +
          '<td><input type="number" min="0" step="1" data-fr-hold="' + k + '" value="' + hold + '" style="width:70px;height:30px;text-align:center;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:var(--mono)"></td>' +
          '<td>' + basisSel(k, r.basis) + '</td>' +
          '<td><input type="number" min="0" step="1" data-fr-age="' + k + '" value="' + age + '" placeholder="—" style="width:70px;height:30px;text-align:center;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:var(--mono)"></td>' +
          '<td><button class="btn secondary" data-fr-del="' + k + '" style="padding:2px 8px;">ลบ</button></td>' +
        '</tr>';
      }).join('');
      body.querySelectorAll('input[data-fr-hold]').forEach(inp => inp.addEventListener('change', () => {
        const k = inp.dataset.frHold; const R = DL.loadFundRules(); if (!R[k]) R[k] = { label: k };
        const v = inp.value.trim(); R[k].holdYears = v === '' ? null : parseInt(v, 10); DL.saveFundRules(R); flash();
      }));
      body.querySelectorAll('select[data-fr-basis]').forEach(sel => sel.addEventListener('change', () => {
        const k = sel.dataset.frBasis; const R = DL.loadFundRules(); if (!R[k]) R[k] = { label: k };
        R[k].basis = sel.value; DL.saveFundRules(R); flash();
      }));
      body.querySelectorAll('input[data-fr-age]').forEach(inp => inp.addEventListener('change', () => {
        const k = inp.dataset.frAge; const R = DL.loadFundRules(); if (!R[k]) R[k] = { label: k };
        const v = inp.value.trim(); R[k].minAge = v === '' ? null : parseInt(v, 10); DL.saveFundRules(R); flash();
      }));
      body.querySelectorAll('button[data-fr-del]').forEach(btn => btn.addEventListener('click', () => {
        const k = btn.dataset.frDel; if (!confirm('ลบเงื่อนไข ' + k + ' ?')) return;
        const R = DL.loadFundRules(); delete R[k]; DL.saveFundRules(R); render();
      }));
    }
    function flash() { const s = document.getElementById('frSaved'); if (s) { s.textContent = '✓ บันทึกแล้ว'; s.style.display = ''; setTimeout(() => { s.style.display = 'none'; }, 1500); } }
    const addBtn = document.getElementById('btnFrAdd');
    if (addBtn && !addBtn.dataset.bound) { addBtn.dataset.bound = '1'; addBtn.addEventListener('click', () => {
      const kEl = document.getElementById('frNewKey'), hEl = document.getElementById('frNewHold'), aEl = document.getElementById('frNewAge'), bEl = document.getElementById('frNewBasis');
      const k = (kEl.value || '').trim().toUpperCase(); if (!k) { alert('ใส่ชื่อประเภทกองทุน'); return; }
      const R = DL.loadFundRules();
      R[k] = { label: (kEl.value || '').trim(), holdYears: hEl.value.trim() === '' ? null : parseInt(hEl.value, 10), minAge: aEl.value.trim() === '' ? null : parseInt(aEl.value, 10), basis: (bEl && bEl.value) || 'anniversary' };
      DL.saveFundRules(R); kEl.value = ''; hEl.value = ''; aEl.value = ''; render(); flash();
    }); }
    const rstBtn = document.getElementById('btnFrReset');
    if (rstBtn && !rstBtn.dataset.bound) { rstBtn.dataset.bound = '1'; rstBtn.addEventListener('click', () => {
      if (!confirm('คืนค่าเริ่มต้นทั้งหมด?')) return;
      DL.resetFundRules(); render(); flash();
    }); }
    render();
  })();

  // ---------- Asset Manager master + remark ----------
  (function amUI() {
    const body = document.getElementById('amBody'); if (!body) return;
    let sortKey = 'name', sortAsc = true;
    function mappedSecs(id) {
      const list = [...new Set(DL.allTrades().filter(t => DL.trxAmId(t) === id).map(t => t.security).filter(Boolean))].sort();
      if (!list.length) return '—';
      return list.length + ' ตัว: ' + list.slice(0, 8).join(', ') + (list.length > 8 ? ' …' : '');
    }
    function secCount(id) { return new Set(DL.allTrades().filter(t => DL.trxAmId(t) === id).map(t => t.security).filter(Boolean)).size; }
    function sortArrows() {
      document.querySelectorAll('#amTable th.amsort').forEach(th => {
        const k = th.dataset.sort; const base = th.textContent.replace(/ [▲▼]$/, '');
        th.textContent = base + (k === sortKey ? (sortAsc ? ' ▲' : ' ▼') : '');
      });
    }
    function render() {
      let ams = DL.allAMs();
      if (!ams.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">ยังไม่มี Asset Manager</td></tr>'; sortArrows(); return; }
      ams = ams.slice().sort((a, b) => {
        let va, vb;
        if (sortKey === 'source') { va = a.source || ''; vb = b.source || ''; }
        else if (sortKey === 'secs') { va = secCount(a.id); vb = secCount(b.id); }
        else { va = String(a.name).toLowerCase(); vb = String(b.name).toLowerCase(); }
        let r = (typeof va === 'number') ? (va - vb) : va.localeCompare(vb, 'th');
        if (r === 0) r = String(a.name).localeCompare(String(b.name), 'th');
        return sortAsc ? r : -r;
      });
      const master = DL.loadAM();
      body.innerHTML = ams.map(a => {
        const srcChip = a.source === 'auto' ? '<span class="chip" style="opacity:.7">auto</span>' : '<span class="chip">manual</span>';
        const rm = (master[a.id] && master[a.id].remark) || '';
        const secs = mappedSecs(a.id);
        const nm = String(a.name).replace(/"/g, '&quot;');
        const nameCell = (a.source === 'auto')
          ? ('<td>' + a.name + ' <span style="color:var(--muted);font-size:10px">(' + a.id + ')</span></td>')
          : ('<td style="text-align:left"><input type="text" data-rename="' + a.id + '" value="' + nm + '" style="width:100%;height:30px;border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-family:var(--font);font-size:13px;background:var(--surface);color:var(--text)"></td>');
        return '<tr>' + nameCell + '<td>' + srcChip + '</td><td style="font-size:12px;color:var(--muted);text-align:left;font-family:var(--font)">' + secs + '</td>' +
               '<td style="text-align:left"><input type="text" data-rm="' + a.id + '" value="' + String(rm).replace(/"/g, '&quot;') + '" placeholder="remark…" style="width:100%;height:30px;border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-family:var(--font);font-size:12px;background:var(--surface);color:var(--text)"></td>' +
               '<td><button class="btn secondary" data-del="' + a.id + '" style="padding:2px 8px;">ลบ</button></td></tr>';
      }).join('');
      sortArrows();
      body.querySelectorAll('input[data-rename]').forEach(inp => inp.addEventListener('change', () => {
        const id = inp.dataset.rename, newN = (inp.value || '').trim();
        if (!newN) { render(); return; }
        const m = DL.loadAM(); if (m[id]) { m[id].name = newN; DL.saveAM(m); }
        render(); DL.refreshAll && DL.refreshAll();
      }));
      body.querySelectorAll('input[data-rm]').forEach(inp => inp.addEventListener('change', () => {
        const m = DL.loadAM(); const id = inp.dataset.rm; if (m[id]) { m[id].remark = inp.value; DL.saveAM(m); }
      }));
      body.querySelectorAll('button[data-del]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.del;
        const used = DL.allTrades().some(t => DL.trxAmId(t) === id);
        if (used && !confirm('AM นี้มีรายการใช้อยู่ — ลบแล้วรายการจะไม่มี AM ยืนยัน?')) return;
        const m = DL.loadAM(); delete m[id]; DL.saveAM(m); render(); DL.refreshAll && DL.refreshAll();
      }));
    }
    document.querySelectorAll('#amTable th.amsort').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (k === sortKey) sortAsc = !sortAsc; else { sortKey = k; sortAsc = true; }
      render();
    }));
    const addBtn = document.getElementById('btnAmAdd');
    if (addBtn && !addBtn.dataset.bound) { addBtn.dataset.bound = '1'; addBtn.addEventListener('click', () => {
      const nEl = document.getElementById('amNew'), rEl = document.getElementById('amNewRemark');
      const n = (nEl && nEl.value || '').trim(); if (!n) { alert('ใส่ชื่อ AM ก่อน'); return; }
      const id = DL.amId(n, true, 'manual');
      if (rEl && rEl.value.trim()) { const m = DL.loadAM(); if (m[id]) { m[id].remark = rEl.value.trim(); DL.saveAM(m); } }
      if (nEl) nEl.value = ''; if (rEl) rEl.value = ''; render();
    }); }
    render();
  })();

  paint();
});
