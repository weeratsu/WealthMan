/**
 * บันทึกรายการลงทุนจาก Gmail ลง Google Drive — รวมทุกเจ้าในสคริปต์เดียว (ตั้ง trigger ตัวเดียว)
 * ============================================================================
 * เก็บอะไรบ้าง:
 *   1) Dime! (หุ้นนอก+กองทุน)  — PDF ไฟล์แนบ จาก no-reply@dime.co.th   → root ของ Confirmation Notes
 *   2) ทอง Hua Seng Heng       — PDF ไฟล์แนบ จาก noreply@huasengheng.com → โฟลเดอร์ Hua Seng Heng Gold Now
 *   3) ทอง MTS Gold (บน Dime)  — ไม่มี PDF! อ่าน "เนื้อเมล" จาก noreply@mtsgoldgroup.com → เขียน mts_gold.json ที่ root ของ Confirmation Notes
 * (1,2) ปรับที่ตัวแปร BILLERS · (3) อยู่ส่วน MTS Gold ท้ายไฟล์
 * ============================================================================
 * ฟังก์ชันที่รัน:
 *   - runAllDaily()         → รันทุกเจ้าในครั้งเดียว (ตั้ง trigger ตัวนี้ตัวเดียว) — PDF + MTS
 *   - runInitialBackfill()  → ครั้งแรก: ดึงเมลเก่าทั้งหมด (PDF ทุกเจ้า + MTS)
 *   - runDailySync()        → PDF เฉพาะ 2 เดือนล่าสุด (ไม่รวม MTS — ใช้ผ่าน runAllDaily)
 *   - createDailyTrigger()  → ตั้ง trigger รายวันที่ runAllDaily (รันครั้งเดียวตอนติดตั้ง)
 * ตั้ง timezone โปรเจกต์เป็น Asia/Bangkok (File > Project Settings)
 */

// ===== ตั้งค่าผู้ให้บริการ (เพิ่มเจ้าใหม่ = เพิ่ม object ในนี้) =====
var BILLERS = [
  {
    name:    'Dime',
    folderId:'1QvbKn7vjm2UwhrK3GeCLAVeHu5_KDx0K',   // Confirmation Notes (Dime)
    sender:  'no-reply@dime.co.th',
    subject: 'ใบยืนยันการซื้อขาย',                     // Confirmation Note
    tag:     '[Confirmation]',
    label:   'Dime-Saved'
  },
  {
    name:    'Gold',
    folderId:'1y-PJoWVA7IenqpfDLH61oSEN1fKeQhYd',   // Hua Seng Heng Gold Now
    sender:  'noreply@huasengheng.com',
    subject: 'ยืนยันการทำรายการ',
    tag:     '[Gold]',
    label:   'Gold-Saved'
  }
];
// ====================================================================

function runInitialBackfill() { BILLERS.forEach(function (b) { _sync_(b, null); }); readMtsGold(); }
function runDailySync()       { BILLERS.forEach(function (b) { _sync_(b, 'newer_than:2m'); }); }

/** รันทุกเจ้าในครั้งเดียว (ตั้ง trigger ตัวนี้ตัวเดียว) — PDF (Dime+HSH) + MTS Gold (email body) */
function runAllDaily() {
  runDailySync();   // investment_save — เซฟ PDF ไฟล์แนบ (Dime + Hua Seng Heng)
  readMtsGold();    // mts — อ่าน body เมล MTS Gold → mts_gold.json
}


function createDailyTrigger() {
  // ลบ trigger เดิมของ runDailySync ก่อน (กันซ้ำ)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['runDailySync','runAllDaily'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAllDaily').timeBased().everyDays(1).atHour(1).create();
  Logger.log('ตั้ง trigger รายวัน (ประมาณ 01:00) เรียบร้อย');
}

/**
 * กวาดไฟล์ของเจ้าหนึ่ง
 * @param {Object} b          config จาก BILLERS
 * @param {string} timeFilter เช่น null/'' หรือ 'newer_than:2m'
 */
function _sync_(b, timeFilter) {
  var folder = DriveApp.getFolderById(b.folderId);
  var label  = GmailApp.getUserLabelByName(b.label) || GmailApp.createLabel(b.label);

  var query = 'from:' + b.sender + ' has:attachment filename:pdf -label:' + b.label;
  if (timeFilter) query += ' ' + timeFilter;
  if (b.subject)  query += ' subject:("' + b.subject + '")';

  var saved = 0, bad = 0, start = 0;
  var PAGE = 50;

  while (true) {
    var threads = GmailApp.search(query, start, PAGE);
    if (threads.length === 0) break;

    threads.forEach(function (thread) {
      var allOk = true;   // เซฟครบทุกไฟล์ในเธรดนี้ไหม (ไม่ครบ = ไม่ติด label รอรอบหน้า)

      thread.getMessages().forEach(function (message) {
        var subject  = message.getSubject() || '';
        var sentDate = message.getDate();            // วันที่ส่งเมล

        // กรองซ้ำด้วย subject (query กรองแล้ว แต่กันพลาด)
        if (b.subject && subject.indexOf(b.subject) === -1) return;

        var d = Utilities.formatDate(sentDate, 'Asia/Bangkok', 'yyyy-MM-dd');

        message.getAttachments().forEach(function (att) {
          var orig = att.getName();
          if (!orig || orig.toLowerCase().slice(-4) !== '.pdf') return;

          var newName = b.tag + ' ' + d + ' - ' + orig;

          // กันไฟล์ซ้ำ (ชื่อ + ขนาดตรง = ข้าม)
          var existing = folder.getFilesByName(newName);
          if (existing.hasNext()) {
            var ef = existing.next();
            if (ef.getSize() === att.getSize()) { Logger.log('[' + b.name + '] ข้าม (ซ้ำ): ' + newName); return; }
            Logger.log('[' + b.name + '] ลบไฟล์เสียเดิม แล้วเซฟใหม่: ' + newName);
            ef.setTrashed(true);
          }

          try {
            // byte ดิบ ไม่แปลง MIME (กันไฟล์เสียกรณี octet-stream)
            var blob = Utilities.newBlob(att.getBytes(), 'application/pdf', newName);
            var expected = att.getSize();
            var file = folder.createFile(blob).setName(newName);

            if (file.getSize() !== expected) {
              Logger.log('⚠️ [' + b.name + '] ไฟล์เสีย (ขนาดไม่ตรง) ลบทิ้ง: ' + newName);
              file.setTrashed(true);
              bad++; allOk = false;
            } else {
              Logger.log('[' + b.name + '] บันทึก: ' + newName + ' (' + expected + ' byte)');
              saved++;
            }
          } catch (e) {
            Logger.log('[' + b.name + '] ผิดพลาด: ' + orig + ' — ' + e);
            bad++; allOk = false;
          }
        });
      });

      if (allOk) thread.addLabel(label);
    });

    start += PAGE;
  }

  Logger.log('[' + b.name + '] เสร็จ — บันทึก ' + saved + ' ไฟล์' +
             (bad ? (' / เสียข้ามไว้ ' + bad) : ''));
}


/* ===================== MTS Gold (email body → mts_gold.json) ===================== */
var MTS_FOLDER_ID = '1QvbKn7vjm2UwhrK3GeCLAVeHu5_KDx0K';  // Confirmation Notes (Dime)
var MTS_FILENAME  = 'mts_gold.json';
var MTS_QUERY      = 'from:noreply@mtsgoldgroup.com subject:("ยืนยันการสั่งซื้อ") after:2023/1/1';
var MTS_LABEL  = 'MTSGold-Processed';

function readMtsGold() {
  var label = GmailApp.getUserLabelByName(MTS_LABEL) || GmailApp.createLabel(MTS_LABEL);
  var existing = _loadExisting_();                 // [{...}]
  var byRef = {}; existing.forEach(function (p) { if (p && p.ref) byRef[p.ref] = p; });

  var start = 0, pageSize = 100, added = 0, scanned = 0;
  while (true) {
    var threads = GmailApp.search(MTS_QUERY + ' -label:' + MTS_LABEL, start, pageSize);
    if (!threads.length) break;
    threads.forEach(function (th) {
      th.getMessages().forEach(function (m) {
        scanned++;
        var p = _parseMtsEmail_(m.getPlainBody() || '', m.getDate(), m.getSubject() || '');
        if (!p) { Logger.log('  [skip] parse=null subj=%s', m.getSubject()); return; }
        if (p.ref && byRef[p.ref]) { Logger.log('  [dup] ref=%s', p.ref); return; }
        byRef[p.ref || ('_' + m.getId())] = p; added++;
        Logger.log('  [add] date=%s units=%s price=%s usd=%s ref=%s', p.iso_date, p.units, p.price, p.total_usd, p.ref);
      });
      th.addLabel(label);
    });
    start += pageSize;
  }

  var all = Object.keys(byRef).map(function (k) { return byRef[k]; });
  all.sort(function (a, b) { return String(a.iso_date || '').localeCompare(String(b.iso_date || '')); });
  // SAFETY: อย่าเขียนทับไฟล์ที่มีข้อมูลด้วยผลลัพธ์ว่าง (กรณี run พลาดชั่วคราว)
  if (all.length === 0 && existing.length > 0) {
    Logger.log('MTS Gold: extracted 0 but file has %s — KEEPING existing.', existing.length);
  } else {
    _writeJson_({ generated_at: _nowIso_(), source: 'MTS Gold (email body)', records: all });
  }
  Logger.log('MTS Gold: scanned %s msgs, %s new, %s total (existing %s)', scanned, added, all.length, existing.length);
}

/** parse 1 email body → {txn_id, iso_date, security, units, price, total_usd, ref, type} */
function _parseMtsEmail_(body, msgDate, subject) {
  body = String(body || '').replace(/\*/g, '').replace(/\u00a0/g, ' ');
  subject = String(subject || '');
  function m1(res) { for (var i = 0; i < res.length; i++) { var m = body.match(res[i]); if (m) return m[1].trim(); } return ''; }

  // เลขที่เอกสาร: "เลขที่: DMB2603170012706"
  var docno = m1([/เลขที่\s*:?\s*([A-Za-z0-9]+)/, /\bDMB(\d{6,})/]);
  if (docno && /^\d/.test(docno)) docno = 'DMB' + docno;

  // ref id จาก subject-style "Ref no. GLDMTSBML..." หรือ "[ref id GLD...]"
  var ref = m1([/Ref\s*no\.?\s*([A-Za-z0-9]+)/i, /ref\s*id\s*([A-Za-z0-9]+)/i, /\b(GLD[A-Za-z0-9]+)/]);

  // วันที่-เวลา: "วันที่ซื้อ: 2026-03-17 22:45:51"  หรือ  "Transaction Time 17/03/2026 22:45:51"
  var isoDirect = m1([/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/]);
  var iso = '';
  if (isoDirect) {
    iso = isoDirect.slice(0, 10);
  } else {
    var dmy = m1([/Transaction\s*Time\s*(\d{2}\/\d{2}\/\d{4})/i, /(\d{2}\/\d{2}\/\d{4})/]);
    var mm = dmy.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (mm) iso = mm[3] + '-' + mm[2] + '-' + mm[1];
  }
  if (!iso) iso = _dateToIso_(msgDate);

  // สินค้า: "GLDOZUSD"
  var security = m1([/\b(GLD[A-Z]{2,}USD)\b/, /\b(GLDOZ\w*)\b/]) || 'GLDOZUSD';

  // แถวตัวเลข: น้ำหนัก(OZ)  ราคาต่อหน่วย(USD)  จำนวนเงิน(USD)
  // "GLDOZUSD 0.0006 OZ 4,987.89 3.00 USD"
  var weight = m1([/([\d,]+\.\d+)\s*OZ/i]);
  var units = weight ? parseFloat(weight.replace(/,/g, '')) : null;

  // ราคาต่อหน่วย: เลขที่มีคอมมา ตามด้วยทศนิยม 2 ตำแหน่ง (เลขใหญ่สุดในแถว)
  var price = null, totalUsd = null;
  var totM = body.match(/TOTAL\s*AMOUNT[^]*?([\d,]+\.\d{2})\s*USD/i);
  if (totM) totalUsd = parseFloat(totM[1].replace(/,/g, ''));
  var priceM = body.match(/OZ\s*([\d,]+\.\d{2})/i);           // ราคาต่อหน่วยอยู่หลัง OZ
  if (priceM) price = parseFloat(priceM[1].replace(/,/g, ''));
  if (totalUsd == null) {
    var allUsd = body.match(/([\d,]+\.\d{2})\s*USD/ig) || [];
    if (allUsd.length) { var last = allUsd[allUsd.length - 1].match(/([\d,]+\.\d{2})/); if (last) totalUsd = parseFloat(last[1].replace(/,/g, '')); }
  }

  // ตัดสิน buy/sell จาก "subject" เท่านั้น (เชื่อถือได้สุด) — ไม่อ่าน body เพราะ footer เมล
  // มักมีราคา "รับซื้อ-ขาย" ทองปนอยู่ → /ขาย/ บน body จับผิดเป็น SEL ทั้งที่เป็นการซื้อ
  // subject ซื้อ = "ยืนยันการสั่งซื้อ" · subject ขาย = "ยืนยันการขาย"/"สั่งขาย"
  var type = /(ยืนยันการขาย|สั่งขาย|ขายคืน)/.test(subject) ? 'SEL' : 'BUY';

  // ต้องเป็นเมลยืนยันการซื้อ + มีข้อมูลพอ
  var ok = /ยืนยันการสั่งซื้อ|ชำระเงินเรียบร้อย|GLDOZ/i.test(body);
  if (!ok) return null;
  if (units == null && totalUsd == null && !ref) return null;

  return {
    txn_id: docno || ref, doc_no: docno, ref: ref,
    iso_date: iso, security: security, type: type,
    units: units, price: price, total_usd: totalUsd, ccy: 'USD',
  };
}

function _dateToIso_(d) {
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
}
function _nowIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss"); }

function _folder_() { return DriveApp.getFolderById(MTS_FOLDER_ID); }
function _loadExisting_() {
  try {
    var it = _folder_().getFilesByName(MTS_FILENAME);
    if (!it.hasNext()) return [];
    var doc = JSON.parse(it.next().getBlob().getDataAsString() || '{}');
    return doc.records || (Array.isArray(doc) ? doc : []);
  } catch (e) { Logger.log('load existing failed: ' + e); return []; }
}
function _writeJson_(obj) {
  var f = _folder_(), body = JSON.stringify(obj, null, 1);
  var it = f.getFilesByName(MTS_FILENAME);
  if (it.hasNext()) it.next().setContent(body);
  else f.createFile(MTS_FILENAME, body, 'application/json');
}


/** รีเซ็ต MTS Gold: ลบ label MTSGold-Processed ออกจากทุกเธรด + ลบ mts_gold.json
 *  ใช้เมื่อแก้ logic การ parse แล้วอยากให้อ่านเมลเก่าใหม่ทั้งหมด (เช่น แก้ buy/sell)
 *  รันตัวนี้ครั้งเดียว แล้วค่อยรัน readMtsGold() หรือ runInitialBackfill() อีกครั้ง */
function resetMtsGold() {
  var label = GmailApp.getUserLabelByName(MTS_LABEL);
  var cleared = 0;
  if (label) {
    var start = 0;
    while (true) {
      var th = label.getThreads(start, 100);
      if (!th.length) break;
      th.forEach(function (t) { t.removeLabel(label); cleared++; });
      start += 100;
    }
  }
  try {
    var it = _folder_().getFilesByName(MTS_FILENAME);
    if (it.hasNext()) { it.next().setTrashed(true); Logger.log('ลบ ' + MTS_FILENAME + ' แล้ว'); }
  } catch (e) { Logger.log('ลบ json ไม่สำเร็จ: ' + e); }
  Logger.log('reset MTS: เคลียร์ label %s เธรด แล้วรัน readMtsGold() ใหม่ได้เลย', cleared);
}
