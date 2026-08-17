import { useEffect, useState } from "react";
import {  ref, onValue } from "firebase/database";
import { rldb } from "./firebase"; // ปรับ path ตามโฟลเดอร์ของคุณ

// Firebase RTDB มี path พิเศษ .info/serverTimeOffset ที่ SDK คำนวณให้อัตโนมัติ
// ค่านี้คือ (เวลา server - เวลาเครื่อง client) หน่วย ms
// เอาไปบวกกับ Date.now() ของเครื่องตัวเอง จะได้ "เวลา server โดยประมาณ" แบบไม่ต้องยิง request
export function useServerTimeOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const offsetRef = ref(rldb, ".info/serverTimeOffset");
    const unsub = onValue(offsetRef, (snap) => {
      setOffset(snap.val() || 0);
    });
    return () => unsub();
  }, []);

  return offset;
}

// helper เรียกใช้ตรงๆ ได้เลยเวลาต้องการ server time ปัจจุบัน
export function getServerNow(offset: number) {
  return Date.now() + offset;
}
