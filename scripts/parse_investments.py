#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse_investments.py — อ่านใบยืนยันการลงทุน (Dime! หุ้นนอก/กองทุน + ทอง Hua Seng Heng) จาก PDF แล้วสร้าง inv_log.json

รองรับ 2 ชนิด:
  - offshore (DIMEOS...)   : หุ้นต่างประเทศ, ราคาสกุล USD + แปลง THB
  - mutual_fund (DIMEMF...): กองทุนรวม, THB ล้วน

วิธีใช้ (บนเครื่อง Windows ที่มี Google Drive sync):
  1. ติดตั้งไลบรารีครั้งเดียว:  pip install pdfplumber
  2. รัน:  python parse_dime.py
  3. ใส่รหัส PDF ตอนโปรแกรมถาม (ไม่ถูกเก็บลงไฟล์)
  4. ได้ไฟล์ dime_log.json วางข้างๆ สคริปต์ (ให้แอป dashboard อ่าน)

- ไม่แตะไฟล์ต้นฉบับ (อ่านอย่างเดียว)
- กันซ้ำด้วย txn_id + order_no (unique ต่อรายการ) — รันกี่รอบก็ได้ ผลเท่าเดิม
"""

import os, re, json, glob, sys, getpass, datetime
import shutil
from collections import defaultdict

# ===== ตั้งค่า =====
# โฟลเดอร์รากที่เก็บ Confirmation Notes (มีโฟลเดอร์ปี 2024/2025/2026 อยู่ข้างใน)
ROOT = r"G:\My Drive\Documents\Investment\Dime\Confirmation Notes"
# โฟลเดอร์รูปปันผล (รูปแคปจากมือถือ) — ไว้ใช้ตอนทำฟีเจอร์ปันผล (ไม่บังคับ)
DIVIDEND_ROOT = r""
# โฟลเดอร์ไฟล์ยืนยันการซื้อขายทอง (Hua Seng Heng) — สแกนเพิ่มจาก ROOT หลัก (ว่าง=ไม่สแกน)
GOLD_ROOT = r"G:\My Drive\Documents\Investment\Hua Seng Heng Gold Now"
# ย้ายไฟล์ PDF เข้าโฟลเดอร์ yyyy/<ชนิด> หลัง parse สำเร็จ (True=ย้าย, False=ปล่อยไว้ที่เดิม)
ARCHIVE_AFTER_PARSE = True
# ไฟล์ผลลัพธ์ (วางข้างๆ สคริปต์)
_HERE = os.path.dirname(os.path.abspath(__file__))

# ---- อ่าน path จาก config.json ถ้ามี (สร้างจากหน้า dime_setup.html) ----
# ลำดับความสำคัญ: config.json > ค่า ROOT ด้านบน
_CONFIG = os.path.join(_HERE, "config.json")
_cfg = {}
if os.path.exists(_CONFIG):
    try:
        with open(_CONFIG, encoding="utf-8") as _cf:
            _cfg = json.load(_cf)
        if _cfg.get("root"):
            ROOT = _cfg["root"]
        if _cfg.get("dividend_root"):
            DIVIDEND_ROOT = _cfg["dividend_root"]
        if _cfg.get("gold_root"):
            GOLD_ROOT = _cfg["gold_root"]
        # ย้ายไฟล์เข้าโฟลเดอร์ปี/ชนิด หลัง parse สำเร็จ (default: เปิด)
        if "archive_after_parse" in _cfg:
            ARCHIVE_AFTER_PARSE = bool(_cfg["archive_after_parse"])
    except Exception as _e:
        print("อ่าน config.json ไม่สำเร็จ ใช้ค่า ROOT เริ่มต้นแทน:", _e)

# ไฟล์ข้อมูลเก็บใน ../data/ (parser อยู่ใน scripts/)
_DATA = os.path.join(_HERE, "..", "data")
os.makedirs(_DATA, exist_ok=True)
OUT_JSON = os.path.join(_DATA, "inv_log.json")        # public: เผื่อเปิดผ่าน web server (ตัดข้อมูลส่วนตัว)
OUT_JS   = os.path.join(_DATA, "inv_data.js")         # public: เปิด dashboard แบบ double-click (ตัดข้อมูลส่วนตัว)
OUT_JS_FULL = os.path.join(_DATA, "inv_data_full.js") # local เท่านั้น: ข้อมูลครบ (gitignore)

# field ที่เป็นข้อมูลส่วนตัว — ตัดออกจากไฟล์ public (dime_data.js / dime_log.json)
# เก็บครบเฉพาะใน dime_data_full.js (ไม่ขึ้น GitHub)
PII_FIELDS = ("account_no",)
RUN_LOG  = os.path.join(_HERE, "run_log.txt") # log การรันแต่ละครั้ง
# ===================

try:
    import pdfplumber
except ImportError:
    print("ยังไม่ได้ติดตั้ง pdfplumber — รัน:  pip install pdfplumber")
    sys.exit(1)


def to_num(s):
    if s is None:
        return None
    s = str(s).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def iso_date(s):
    """dd/mm/yyyy -> yyyy-mm-dd"""
    try:
        d, m, y = s.split("/")
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    except Exception:
        return ""


def parse_offshore(pdf):
    pg = pdf.pages[0]
    words = pg.extract_words()
    full = pg.extract_text() or ""
    page2 = pdf.pages[1].extract_text() if len(pdf.pages) > 1 else ""

    hdr = {}
    m = re.search(r'(DIMEOS\d+)', full); hdr['txn_id'] = m.group(1) if m else ''
    m = re.search(r'\b(\d{16})\b', full); hdr['doc_no'] = m.group(1) if m else ''
    m = re.search(r'\b(800\d{8})\b', full); hdr['account_no'] = m.group(1) if m else ''
    fx = re.search(r'\b(3[0-9]\.\d{3,4})\b', page2 or ""); hdr['fx'] = to_num(fx.group(1)) if fx else None
    dts = re.findall(r'(\d{2}/\d{2}/\d{4})', full)
    hdr['issue_date'] = dts[-1] if dts else ''

    cols = {'order':33,'settle':76,'type':138,'sec':192,'unit':252,'price':315,
            'ccy':351,'gross':412,'fee':466,'wht':514,'total':559}
    def col_for(x): return min(cols, key=lambda n: abs(x - cols[n]))

    order_lines = [w for w in words if re.fullmatch(r'\d{6}', w['text']) and w['top'] > 370]
    trades = []
    for ow in order_lines:
        y0 = ow['top']; usd = defaultdict(list); thb = defaultdict(list); tick = []
        for w in words:
            cx = (w['x0'] + w['x1']) / 2; dy = w['top'] - y0
            if abs(dy) <= 4:
                usd[col_for(cx)].append((w['x0'], w['text']))
            elif 4 < dy <= 12:
                thb[col_for(cx)].append((w['x0'], w['text']))
            elif -10 <= dy < -2 and 180 < cx < 230:
                tick.append((w['x0'], w['text']))
        j = lambda d, c: ' '.join(t for _, t in sorted(d.get(c, [])))
        trades.append({
            'asset_class':'offshore','txn_id':hdr['txn_id'],'doc_no':hdr['doc_no'],
            'account_no':hdr['account_no'],'issue_date':hdr['issue_date'],
            'iso_date':iso_date(hdr['issue_date']),'fx_thb_usd':hdr['fx'],
            'order_no':j(usd,'order'),'settlement':j(usd,'settle'),'type':j(usd,'type'),
            'security':' '.join(t for _, t in sorted(tick)),'exchange':j(thb,'sec').strip('[]'),
            'units':to_num(j(usd,'unit')),'price':to_num(j(usd,'price')),'ccy':j(usd,'ccy') or 'USD',
            'gross_usd':to_num(j(usd,'gross')),'fee_usd':to_num(j(usd,'fee')),'total_usd':to_num(j(usd,'total')),
            'gross_thb':to_num(j(thb,'gross')),'fee_thb':to_num(j(thb,'fee')),'total_thb':to_num(j(thb,'total')),
        })
    return trades


def parse_mutual(pdf):
    full = pdf.pages[0].extract_text() or ""
    hdr = {}
    m = re.search(r'(DIMEMF\d+)', full); hdr['txn_id'] = m.group(1) if m else ''
    m = re.search(r'Account No\.\s*(\d+)', full); hdr['account_no'] = m.group(1) if m else ''
    dts = re.findall(r'(\d{2}/\d{2}/\d{4})', full); hdr['issue_date'] = dts[-1] if dts else ''
    trades = []
    pat = r'(\d{13,})\s+(SUB|RED|SWI|SWO)\s+(\S+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)'
    for m in re.finditer(pat, full):
        trades.append({
            'asset_class':'mutual_fund','txn_id':hdr['txn_id'],'doc_no':'',
            'account_no':hdr['account_no'],'issue_date':hdr['issue_date'],
            'iso_date':iso_date(hdr['issue_date']),'fx_thb_usd':None,
            'order_no':m.group(1),'settlement':hdr['issue_date'],'type':m.group(2),
            'security':m.group(3),'exchange':'',
            'units':to_num(m.group(4)),'price':to_num(m.group(5)),'ccy':'THB',
            'gross_usd':None,'fee_usd':None,'total_usd':None,
            'gross_thb':to_num(m.group(6)),'fee_thb':to_num(m.group(7)),'total_thb':to_num(m.group(6)),
        })
    return trades


def parse_gold(pdf):
    """ทอง Hua Seng Heng — ใบยืนยันการทำรายการ (THB ล้วน, 1 รายการ/ใบ)
       text layer เพี้ยน (glyph ไทยมั่ว) แต่ตัวเลขสะอาด → parse ด้วย regex + ตำแหน่ง top"""
    pg = pdf.pages[0]
    words = pg.extract_words(use_text_flow=False, keep_blank_chars=False)
    full = " ".join(w['text'] for w in words)

    m = re.search(r'(GB\d{10,})', full)
    txn = m.group(1) if m else ''

    md = re.search(r'(\d{2})/(\d{2})/(\d{4})', full)   # วันที่ พ.ศ.
    issue = iso = ''
    if md:
        dd, mm, by = md.group(1), md.group(2), int(md.group(3))
        yyyy = by - 543                                # พ.ศ. → ค.ศ.
        iso = f"{yyyy:04d}-{mm}-{dd}"
        issue = f"{dd}/{mm}/{yyyy}"
    mt = re.search(r'(\d{2}:\d{2}:\d{2})', full)
    tm = mt.group(1) if mt else ''

    typ = 'SEL' if re.search(r'ขาย', full) else 'BUY'   # ลูกค้าซื้อ/ขาย (ซื้อ=default) — ใช้ SEL ให้ตรงกับ offshore/ตัวกรอง
    mp = re.search(r'(\d{2}\.\d{2})%', full)
    purity = mp.group(1) if mp else ''

    # แถวตัวเลขตามตำแหน่ง top: น้ำหนัก(กรัม)~431, ราคา/บาททอง~466, จำนวนเงิน~501
    rows = {}
    for w in words:
        if re.fullmatch(r'[\d,]+\.?\d*', w['text']):
            rows.setdefault(round(w['top']), []).append(w['text'])
    def pick(top_target, tol=6):
        best = None
        for t, vals in rows.items():
            if abs(t - top_target) <= tol:
                best = vals[-1]
        return to_num(best) if best else None
    units  = pick(431)   # กรัม
    price  = pick(466)   # บาท ต่อ บาททอง (ราคาทอง 96.5%)
    amount = pick(501)   # จำนวนเงิน THB

    mr = re.search(r'#(\d+)', full)
    order = mr.group(1) if mr else ''

    return [{
        'asset_class':'gold','txn_id':txn,'doc_no':txn,'account_no':'',
        'issue_date':issue,'iso_date':iso,'fx_thb_usd':None,
        'order_no':order,'settlement':issue,'type':typ,
        'security':(f'Gold {float(purity):g}%' if purity else 'Gold'),'exchange':'Hua Seng Heng',
        'units':units,'price':price,'ccy':'THB',
        'gross_usd':None,'fee_usd':None,'total_usd':None,
        'gross_thb':amount,'fee_thb':0.0,'total_thb':amount,
    }]


def main():
    if not os.path.isdir(ROOT):
        print(f"ไม่พบโฟลเดอร์: {ROOT}")
        print("แก้ค่า ROOT ด้านบนสคริปต์ให้ตรงกับเครื่องคุณ")
        sys.exit(1)

    # ---- โหมดการทำงาน ----
    # ปกติ: โหลดข้อมูลเก่าจาก dime_data_full.js + อ่าน PDF เฉพาะที่ root (ไฟล์ใหม่) → เร็ว
    # rebuild: อ่าน PDF ทุกไฟล์ใหม่หมด (สั่งด้วย argument 'rebuild' หรือ '--rebuild')
    REBUILD = any(a.lower().lstrip('-') == 'rebuild' for a in sys.argv[1:])
    prior_trades = []
    if not REBUILD and os.path.exists(OUT_JS_FULL):
        try:
            _raw = open(OUT_JS_FULL, encoding="utf-8").read()
            _s = _raw.find('{'); _e = _raw.rfind('}')
            if _s != -1 and _e != -1:
                prior_trades = (json.loads(_raw[_s:_e+1]) or {}).get('trades', []) or []
        except Exception as _e:
            print("อ่านข้อมูลเก่าไม่สำเร็จ จะ scan ใหม่ทั้งหมด:", _e)
            prior_trades = []
    FAST = (not REBUILD) and bool(prior_trades)   # โหมดเร็ว: มีข้อมูลเก่าให้ต่อยอด
    if REBUILD:
        print("โหมด REBUILD: อ่าน PDF ใหม่ทุกไฟล์")
    elif FAST:
        print(f"โหมดปกติ: ใช้ข้อมูลเดิม {len(prior_trades)} รายการ + อ่านเฉพาะไฟล์ใหม่ที่ root (สั่ง rebuild ได้ด้วย: run_dime.bat rebuild)")
    else:
        print("ยังไม่มีข้อมูลเดิม — scan ไฟล์ทั้งหมดครั้งแรก")

    # Password resolution (so Task Scheduler can run unattended):
    #   1) environment variable DIME_PDF_PW
    #   2) config.json key "pdf_password"
    #   3) interactive prompt (manual run) - hidden typing
    # Password resolution priority (so Task Scheduler can run unattended):
    #   1) a CLI argument that is NOT 'rebuild' (e.g. run_dime.bat 12111981  OR  run_dime.bat rebuild 12111981)
    #   2) environment variable DIME_PDF_PW
    #   3) config.json key "pdf_password"
    #   4) interactive prompt (manual run)
    # สแกนหลายโฟลเดอร์: ROOT (Dime) + GOLD_ROOT (ทอง) ถ้าตั้งไว้
    SCAN_ROOTS = [ROOT] + ([GOLD_ROOT] if GOLD_ROOT and os.path.isdir(GOLD_ROOT) else [])
    files = []
    file_root = {}   # fp -> โฟลเดอร์ต้นทางที่สแกนเจอ (ใช้ตอนย้ายไฟล์ให้ถูก root)
    for _root in SCAN_ROOTS:
        if FAST:
            # อ่านเฉพาะไฟล์ PDF ที่ root ชั้นบนสุด (ไฟล์ใหม่ที่ยังไม่ได้ย้ายเข้าปี)
            for fn in os.listdir(_root):
                fp = os.path.join(_root, fn)
                if os.path.isfile(fp) and fn.lower().endswith(".pdf"):
                    files.append(fp); file_root[fp] = _root
        else:
            # REBUILD หรือครั้งแรก: อ่านทุกไฟล์ (รวมโฟลเดอร์ปี)
            for dirpath, _, filenames in os.walk(_root):
                for fn in filenames:
                    if fn.lower().endswith(".pdf"):
                        fp = os.path.join(dirpath, fn)
                        files.append(fp); file_root[fp] = _root
    files.sort()
    print(f"ไฟล์ PDF ที่จะอ่าน: {len(files)} ไฟล์" + (" (เฉพาะที่ root)" if FAST else ""))

    # v2 (user Oct 15 2026): find files BEFORE asking for a password. If there are no new PDFs,
    # exit immediately — never prompt (this was the hang: getpass ran before the file check, so an
    # unattended Task Scheduler run blocked forever waiting for a password even with 0 files).
    if not files:
        print("ไม่มี PDF ใหม่ที่ root - ไม่มีอะไรให้อ่าน (จบ)")
        sys.exit(0)
    # v2: password resolution AFTER we know there are files. Priority: CLI arg -> env -> config.
    pw = ""
    for _a in sys.argv[1:]:
        if _a.lower().lstrip('-') != 'rebuild' and _a.strip():
            pw = _a.strip(); break
    if not pw:
        pw = os.environ.get("DIME_PDF_PW", "").strip()
    if not pw:
        try:
            pw = str((_cfg or {}).get("pdf_password", "")).strip()
        except Exception:
            pw = ""
    if pw:
        print("ใช้รหัส PDF จาก env/config (โหมดอัตโนมัติ)")
    elif sys.stdin and sys.stdin.isatty():
        # interactive terminal only — safe to prompt
        pw = getpass.getpass("ใส่รหัส PDF (ไม่ถูกเก็บลงไฟล์): ").strip()
    else:
        # v2: unattended (Task Scheduler, no console) and no password configured -> fail fast,
        # do NOT block on getpass. Tell the user where to set it.
        print("** ไม่พบรหัส PDF (arg/env DIME_PDF_PW/config.json pdf_password) และรันแบบไม่มีหน้าจอ - ข้าม (ตั้ง pdf_password ใน config.json) **")
        sys.exit(2)


    all_trades = []
    seen = set()
    errors = []
    file_meta = {}   # fp -> {'class':..., 'year':...} สำหรับย้ายไฟล์หลัง parse
    # ใส่ข้อมูลเก่าก่อน (โหมดเร็ว) — กันซ้ำด้วย txn_id+order_no เดียวกัน
    for row in prior_trades:
        key = (row.get('txn_id'), row.get('order_no'))
        if key in seen:
            continue
        seen.add(key)
        all_trades.append(row)
    for fp in files:
        fname = os.path.basename(fp)
        try:
            with pdfplumber.open(fp, password=pw) as pdf:
                if '[Gold]' in fname or 'GB962' in fname or 'huasengheng' in fname.lower():
                    t = parse_gold(pdf)
                elif 'offshore' in fname or 'DIMEOS' in fname:
                    t = parse_offshore(pdf)
                elif 'mutual_fund' in fname or 'DIMEMF' in fname:
                    t = parse_mutual(pdf)
                else:
                    t = parse_mutual(pdf) or parse_offshore(pdf)
            for row in t:
                row['source_file'] = fname
                key = (row['txn_id'], row['order_no'])   # กันซ้ำด้วย txn_id + order_no
                if key in seen:
                    continue
                seen.add(key)
                all_trades.append(row)
            if not t:
                errors.append((fname, "no trades parsed"))
            else:
                # เก็บชนิด + ปี จากรายการแรกของไฟล์ (ใช้ตอนย้ายไฟล์)
                _cls = t[0].get('asset_class', '')
                _iso = next((r.get('iso_date') for r in t if r.get('iso_date')), '')
                _yr = _iso[:4] if _iso else ''
                file_meta[fp] = {'class': _cls, 'year': _yr, 'root': file_root.get(fp, ROOT)}
        except Exception as e:
            errors.append((fname, repr(e)[:150]))

    # ---- อ่านทอง MTS Gold จาก mts_gold.json (เมล Dime ไม่มี PDF — Apps Script เขียนไว้ที่ root) ----
    # map เป็น asset_class='gold' (ccy=USD, units=oz) · กันซ้ำด้วย txn_id+order_no เดียวกับ PDF
    _mts = os.path.join(ROOT, "mts_gold.json")
    if os.path.exists(_mts):
        try:
            _doc = json.load(open(_mts, encoding="utf-8"))
            _recs = _doc.get("records", _doc if isinstance(_doc, list) else []) or []
            _n = 0
            for rec in _recs:
                iso = rec.get("iso_date", "") or ""
                order = rec.get("ref", "") or rec.get("order_no", "")
                txn = rec.get("txn_id", "") or rec.get("doc_no", "") or order
                key = (txn, order)
                if key in seen:
                    continue
                seen.add(key)
                all_trades.append({
                    'asset_class':'gold','txn_id':txn,'doc_no':rec.get("doc_no",""),'account_no':'',
                    'issue_date': (f"{iso[8:10]}/{iso[5:7]}/{iso[0:4]}" if len(iso) >= 10 else iso),
                    'iso_date':iso,'fx_thb_usd':None,
                    'order_no':order,'settlement':iso,'type':rec.get("type","BUY"),
                    'security':rec.get("security","Gold (MTS)"),'exchange':'MTS Gold',
                    'units':rec.get("units"),'price':rec.get("price"),'ccy':rec.get("ccy","USD"),
                    'gross_usd':rec.get("total_usd"),'fee_usd':0.0,'total_usd':rec.get("total_usd"),
                    'gross_thb':None,'fee_thb':None,'total_thb':None,
                    'source_file':'mts_gold.json',
                })
                _n += 1
            print(f"MTS Gold: อ่าน {_n} รายการจาก mts_gold.json")
        except Exception as e:
            errors.append(("mts_gold.json", repr(e)[:150]))

    all_trades.sort(key=lambda r: (r['iso_date'], r['order_no']))

    payload = {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "source_folder": ROOT,
        "file_count": len(set(r.get('source_file') for r in all_trades if r.get('source_file'))),
        "trade_count": len(all_trades),
        "trades": all_trades,
    }
    # ---- สร้างเวอร์ชัน public (ตัดข้อมูลส่วนตัว) ----
    def _strip_pii(trade):
        return {k: v for k, v in trade.items() if k not in PII_FIELDS}
    payload_public = {
        "generated_at": payload["generated_at"],
        "source_folder": "",   # ไม่เปิดเผย path เครื่อง
        "file_count": payload["file_count"],
        "trade_count": payload["trade_count"],
        "trades": [_strip_pii(t) for t in all_trades],
    }

    # 1) inv_data_full.js — ข้อมูลครบ (LOCAL เท่านั้น, อยู่ใน .gitignore)
    with open(OUT_JS_FULL, "w", encoding="utf-8") as f:
        f.write("window.INV_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";")
    # 2) inv_data.js — public (ตัดข้อมูลส่วนตัว) สำหรับขึ้น GitHub
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("window.INV_DATA = ")
        json.dump(payload_public, f, ensure_ascii=False)
        f.write(";")
    # 3) inv_log.json — public JSON (ตัดข้อมูลส่วนตัว)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload_public, f, ensure_ascii=False, indent=2)

    # ---- ย้ายไฟล์ที่ parse สำเร็จ เข้าโฟลเดอร์ yyyy/<ชนิด> ----
    # ย้ายเฉพาะไฟล์ที่: parse ได้รายการ, รู้ปี+ชนิด, และยังอยู่ที่ ROOT ชั้นบนสุด (ไม่ใช่ในโฟลเดอร์ปีอยู่แล้ว)
    CLASS_FOLDER = {'offshore': 'Offshore', 'mutual_fund': 'Mutual Fund', 'gold': 'Gold'}
    moved, move_errors = [], []
    if ARCHIVE_AFTER_PARSE:
        for fp, meta in file_meta.items():
            try:
                # แต่ละไฟล์ย้ายเข้า "root ของตัวเอง" (Dime → ROOT, ทอง → GOLD_ROOT)
                my_root = meta.get('root', ROOT)
                # อยู่ที่ root ชั้นบนสุดเท่านั้น (ไฟล์ในโฟลเดอร์ปีแล้ว ข้าม)
                if os.path.abspath(os.path.dirname(fp)) != os.path.abspath(my_root):
                    continue
                yr = meta.get('year'); cls = CLASS_FOLDER.get(meta.get('class'))
                if not yr or not cls:
                    continue   # ปี/ชนิดไม่ชัด → ไม่ย้าย (ปล่อยไว้ที่ ROOT)
                dest_dir = os.path.join(my_root, yr, cls)
                os.makedirs(dest_dir, exist_ok=True)
                dest = os.path.join(dest_dir, os.path.basename(fp))
                # กันเขียนทับ: ถ้าปลายทางมีชื่อซ้ำ เติม _2, _3...
                if os.path.exists(dest):
                    base, ext = os.path.splitext(os.path.basename(fp)); i = 2
                    while os.path.exists(os.path.join(dest_dir, f"{base}_{i}{ext}")):
                        i += 1
                    dest = os.path.join(dest_dir, f"{base}_{i}{ext}")
                shutil.move(fp, dest)
                moved.append((os.path.basename(fp), f"{yr}/{cls}"))
            except Exception as _me:
                move_errors.append((os.path.basename(fp), repr(_me)[:120]))

    # 3) เขียน log การรัน (ต่อท้ายไฟล์เดิม — เก็บประวัติทุกครั้งที่รัน)
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = []
    lines.append(f"===== รันเมื่อ {ts} =====")
    lines.append(f"โฟลเดอร์: {ROOT}")
    lines.append(f"ไฟล์ PDF ที่พบ: {len(files)} | รายการซื้อขายทั้งหมด: {len(all_trades)}")
    # สรุปจำนวนรายการต่อไฟล์
    from collections import Counter as _Counter
    per_file = _Counter(r['source_file'] for r in all_trades)
    for fp in files:
        fn = os.path.basename(fp)
        n = per_file.get(fn, 0)
        lines.append(f"  [{n:>2} รายการ] {fn}")
    if errors:
        lines.append(f"ไฟล์มีปัญหา: {len(errors)}")
        for fn, e in errors:
            lines.append(f"  !! {fn} | {e}")
    if moved:
        lines.append(f"ย้ายไฟล์เข้าโฟลเดอร์ปี/ชนิด: {len(moved)}")
        for fn, dst in moved:
            lines.append(f"  -> {dst}/  {fn}")
    if move_errors:
        lines.append(f"ย้ายไฟล์ไม่สำเร็จ: {len(move_errors)}")
        for fn, e in move_errors:
            lines.append(f"  !! {fn} | {e}")
    lines.append("")
    with open(RUN_LOG, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    # แสดงผลบนหน้าจอ
    print(f"เขียนผลแล้ว:\n  - {OUT_JS_FULL} (local ครบ)\n  - {OUT_JS} (public)\n  - {OUT_JSON} (public)\n  - {RUN_LOG} (log)")
    print(f"  รายการซื้อขายทั้งหมด: {len(all_trades)} จาก {len(files)} ไฟล์")
    if moved:
        print(f"  ย้ายไฟล์เข้าโฟลเดอร์ปี/ชนิด: {len(moved)} ไฟล์")
    if errors:
        print(f"  ไฟล์มีปัญหา: {len(errors)}")
        for fn, e in errors:
            print("   !!", fn, "|", e)


if __name__ == "__main__":
    main()
