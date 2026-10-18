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

  paint();
});
