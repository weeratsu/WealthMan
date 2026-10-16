# Dime! Investment Log

เก็บ log การซื้อขายจากใบยืนยัน (Confirmation Note) ของแอป **Dime!** โดยอัตโนมัติ แล้วแสดงเป็น dashboard — รองรับทั้งหุ้นต่างประเทศ (offshore) และกองทุนรวม (mutual fund)

🔗 **Live demo:** _(เปิด GitHub Pages แล้วใส่ลิงก์ตรงนี้)_

> ข้อมูลที่แสดงในเดโมเป็น **เฉพาะรายการซื้อขาย** — ข้อมูลส่วนตัว (เลขบัญชี ฯลฯ) ถูกตัดออก และไม่ถูก push ขึ้น repo (ดู `.gitignore`)

## ทำงานยังไง

1. **Google Apps Script** (บน cloud) — ดึง PDF ใบยืนยันจาก Gmail → เซฟลง Google Drive แยกตามปี (รันอัตโนมัติทุกวัน)
2. **`parse_dime.py`** (บนเครื่อง) — อ่าน PDF ทุกไฟล์ → ถอดรหัส → ดึงรายการซื้อขาย → สร้างไฟล์ข้อมูล
3. **Dashboard** (`index.html`) — แสดง KPI, กราฟ, ตารางรายการ, export Excel, backup/import

## ใช้งาน

```bash
pip install pdfplumber        # ติดตั้งครั้งเดียว
python scripts/parse_dime.py   # หรือดับเบิลคลิก scripts/run_dime.bat
```

ใส่รหัส PDF เมื่อถาม → ได้ไฟล์ข้อมูล → เปิด `index.html`

## โครงสร้างไฟล์

```
DimeLog/
├── index.html            # หน้าสรุป (dashboard) — GitHub Pages เปิดอัตโนมัติ
├── dime_trades.html      # ตารางรายการทั้งหมด + export Excel + backup/import
├── dime_help.html        # คู่มือการใช้งาน
├── README.md
├── .gitignore
├── data/
│   ├── dime_data.js      # ข้อมูล public (ตัดข้อมูลส่วนตัว) ✅ ขึ้น repo
│   ├── dime_log.json     # ข้อมูล public (JSON)
│   └── dime_data_full.js # ข้อมูลครบ 🔒 local เท่านั้น (gitignored)
└── scripts/
    ├── parse_dime.py     # ตัวอ่าน PDF → สร้างไฟล์ข้อมูลใน ../data/
    └── run_dime.bat      # กดเดียวจบ: รัน parser + เปิด dashboard
```

