"use client";
import { useEffect } from "react";
import { ref, onDisconnect, update, remove, serverTimestamp } from "firebase/database";
import { rldb } from "./firebase";

// แจ้งว่าผู้เล่นคนนี้ online อยู่ ผ่าน multi-path update:
//  - presence/{roomId}/{uid}                    → เช็คว่ามีใครอยู่ในห้องบ้าง
//  - rooms/{roomId}/players/{uid}/online         → UI โชว์สถานะ online/offline
//  - rooms/{roomId}/players/{uid}/lastOfflineAt  → cron ใช้เช็คว่า offline มานานแค่ไหน
// เมื่อ client หลุด onDisconnect จะเขียนทั้งหมดให้เองฝั่ง server
// หมายเหตุ: online status ไม่ใช่ sensitive state จึงให้ client เขียนตรงได้
export function usePresence(
  roomId: string | null,
  uid: string | null | undefined,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled || !roomId || !uid) return;

    const presenceRef = ref(rldb, `presence/${roomId}/${uid}`);
    const rootRef = ref(rldb); // สำหรับ multi-path update
    const disconnect = onDisconnect(rootRef);
    let cancelled = false;

    async function register() {
      // ตั้งค่า onDisconnect ให้เขียนตอน client หลุด (รอให้สำเร็จก่อน)
      await disconnect.update({
        [`presence/${roomId}/${uid}`]: null,
        [`rooms/${roomId}/players/${uid}/online`]: false,
        [`rooms/${roomId}/players/${uid}/lastOfflineAt`]: serverTimestamp(),
      });
      if (cancelled) return;
      // แล้วค่อยเขียนว่าออนไลน์อยู่ กัน race ที่หลุดก่อนลงทะเบียนเสร็จ
      await update(rootRef, {
        [`presence/${roomId}/${uid}`]: true,
        [`rooms/${roomId}/players/${uid}/online`]: true,
      });
    }

    register().catch((err) => console.error("usePresence error:", err));

    return () => {
      cancelled = true;
      disconnect.cancel();
      remove(presenceRef).catch(() => {});
      update(rootRef, {
        [`rooms/${roomId}/players/${uid}/online`]: false,
        [`rooms/${roomId}/players/${uid}/lastOfflineAt`]: serverTimestamp(),
      }).catch(() => {});
    };
  }, [roomId, uid, enabled]);
}
