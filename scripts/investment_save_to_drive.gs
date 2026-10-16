/**
 * บันทึกไฟล์แนบ PDF ใบยืนยันการลงทุน จาก Gmail ลง Google Drive  (รวมหลายเจ้าในสคริปต์เดียว)
 * ============================================================================
 * เก็บไฟล์อะไรบ้าง (แก้/เพิ่มได้ที่ตัวแปร BILLERS ด้านล่าง):
 *
 *   1) Dime! (หุ้นนอก + กองทุน)
 *      - ผู้ส่ง : no-reply@dime.co.th
 *      - subject: "ใบยืนยันการซื้อขาย" (Confirmation Note)
 *      - โฟลเดอร์: Confirmation Notes (FOLDER_ID ของ Dime)
 *      - ตั้งชื่อ: [Confirmation] yyyy-mm-dd - <ชื่อไฟล์เดิม>
 *
 *   2) ทอง — Hua Seng Heng Gold Now
 *      - ผู้ส่ง : noreply@huasengheng.com
 *      - subject: "ยืนยันการทำรายการ"
 *      - โฟลเดอร์: Hua Seng Heng Gold Now (FOLDER_ID ของทอง)
 *      - ตั้งชื่อ: [Gold] yyyy-mm-dd - <ชื่อไฟล์เดิม>
 * ============================================================================
 * ทุกเจ้า: เซฟลง "root" ของโฟลเดอร์ตัวเอง (ไม่แยกปี) — ให้ parser ฝั่งเครื่องย้ายเข้าปี/ชนิดทีหลัง
 *          บันทึก byte ดิบจากไฟล์แนบตรงๆ (ไม่แปลง MIME — ไฟล์แนบบางเจ้าเป็น octet-stream)
 *          กันซ้ำ 2 ชั้น: label ต่อเจ้า + เช็กชื่อไฟล์ซ้ำในโฟลเดอร์
 *          ติด label เฉพาะ thread ที่เซฟครบทุกไฟล์ (เสีย → เว้นไว้รอบหน้า)
 *
 * โหมดการทำงาน (รันครั้งเดียว ครบทุกเจ้า):
 *   - runInitialBackfill()  → ครั้งแรก: ดึงเมลเก่าทั้งหมด (ไม่จำกัดเวลา)
 *   - runDailySync()        → ประจำวัน: ดึงย้อนหลัง 2 เดือน  (ตั้ง trigger ตัวนี้)
 *   - createDailyTrigger()  → ตั้ง trigger รายวันให้ runDailySync (รันครั้งเดียวตอนติดตั้ง)
 *
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

function runInitialBackfill() { BILLERS.forEach(function (b) { _sync_(b, null); }); }
function runDailySync()       { BILLERS.forEach(function (b) { _sync_(b, 'newer_than:2m'); }); }

function createDailyTrigger() {
  // ลบ trigger เดิมของ runDailySync ก่อน (กันซ้ำ)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDailySync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDailySync').timeBased().everyDays(1).atHour(1).create();
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
