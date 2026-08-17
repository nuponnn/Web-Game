"use client";
import { useEffect, useState } from "react";
import { useServerTimeOffset } from "../lib/useServerTime";

interface CountdownProps {
  endsAt: number; // absolute timestamp (ms) จาก database เช่น round.endsAt
  onExpire?: () => void; // เรียกครั้งเดียวตอนเวลาหมด (ไปเรียก endRound function ต่อ)
}

export function Countdown({ endsAt, onExpire }: CountdownProps) {
  const offset = useServerTimeOffset();
  const [remainingMs, setRemainingMs] = useState(() => endsAt - Date.now());
  const [hasExpired, setHasExpired] = useState(false);

  useEffect(() => {
   if (hasExpired) return;// reset ถ้า endsAt เปลี่ยน (รอบใหม่)

    const tick = () => {
      const serverNow = Date.now() + offset;
      const remaining = Math.max(0, endsAt - serverNow);
      setRemainingMs(remaining);

      if (remaining <= 0) {
        setHasExpired((already) => {
          if (!already && onExpire) onExpire();
          return true;
        });
      }
    };

    tick(); // เรียกทันทีไม่ต้องรอ interval แรก
    const id = setInterval(tick, 250); // ทุก 250ms พอให้ตาเห็นลื่น ไม่กิน CPU เกินจำเป็น
    return () => clearInterval(id);
  }, [endsAt, offset, onExpire]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className={hasExpired ? "text-red-500 font-bold" : ""}>
      {hasExpired ? "หมดเวลา!" : `${minutes}:${String(seconds).padStart(2, "0")}`}
    </div>
  );
}
