"use client";
import { useEffect, useRef, useState } from "react";
import { useServerTimeOffset } from "../lib/useServerTime";

interface CountdownProps {
  endsAt: number; // absolute timestamp (ms) จาก database เช่น round.endsAt
  onExpire?: () => void; // เรียกครั้งเดียวตอนเวลาหมด (ไปเรียก endRound function ต่อ)
}

export function Countdown({ endsAt, onExpire }: CountdownProps) {
  const offset = useServerTimeOffset();
  const [remainingMs, setRemainingMs] = useState(() => endsAt - Date.now());
  const [hasExpired, setHasExpired] = useState(false);

  // เก็บ onExpire ไว้ใน ref กัน effect ข้างล่าง re-subscribe ทุกครั้งที่ parent re-render
  // (parent ส่ง inline function ใหม่ทุก render -> ถ้าใส่ใน deps interval จะ restart บ่อย)
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (hasExpired) return; // reset ถ้า endsAt เปลี่ยน (รอบใหม่)

    const tick = () => {
      const serverNow = Date.now() + offset;
      const remaining = Math.max(0, endsAt - serverNow);
      setRemainingMs(remaining);

      if (remaining <= 0) {
        setHasExpired(true);
      }
    };

    tick(); // เรียกทันทีไม่ต้องรอ interval แรก
    const id = setInterval(tick, 250); // ทุก 250ms พอให้ตาเห็นลื่น ไม่กิน CPU เกินจำเป็น
    return () => clearInterval(id);
  }, [endsAt, offset, hasExpired]);

  // เรียก onExpire แบบ effect แยก ตอน hasExpired เพิ่ง flip เป็น true
  // (ไม่เรียก inside state updater กัน React StrictMode เรียก updater ซ้ำ 2 รอบ)
  useEffect(() => {
    if (hasExpired) onExpireRef.current?.();
  }, [hasExpired]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className={hasExpired ? "text-red-500 font-bold" : ""}>
      {hasExpired ? "หมดเวลา!" : `${minutes}:${String(seconds).padStart(2, "0")}`}
    </div>
  );
}
