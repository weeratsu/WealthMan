/* WealthMan — FX seed (USD→THB rates, ฿ ต่อ 1 USD)
   รูปแบบ: { "yyyy-mm-dd": rate }  ·  ปล่อยว่างไว้ได้ — ระบบดึงเรทจริงจาก trx (fx_thb_usd) มาใช้อยู่แล้ว
   ถ้าต้องการใส่เรทตั้งต้นสำหรับวันที่ไม่มีใน trx (เช่นช่วงเงินปันผล) เพิ่มใน rates ด้านล่างได้
   แต่ปกติแนะนำให้กรอกผ่านแท็บ FX Rates (เก็บใน localStorage) แทน */
window.INV_FX = {
  rates: {}
};
