"use client";
import { useEffect } from "react";
import {  ref, onDisconnect, set, remove  } from "firebase/database";
import { rldb } from "@/firebase";
// แจ้ง backend ว่าผู้เล่นคนนี้กำลังอยู่ในห้องผ่าน path presence/{roomId}/{uid}
// เมื่อ client หลุดการเชื่อมต่อ (ปิด tab / internet ตัด) onDisconnect จะลบ presence
// ออกให้เอง ทำให้ backend ลบห้องได้ทันทีถ้า host หลุด หรือไม่มีใครออนไลน์เหลือ
export function usePresence(
  roomId: string | null,
  uid: string | null | undefined,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled || !roomId || !uid) return;

    const presenceRef = ref(rldb, `presence/${roomId}/${uid}`);
    const disconnect = onDisconnect(presenceRef);
    let cancelled = false;

    async function register() {
      // สั่งให้ server ลบ presence ออกเองตอน client หลุด (รอให้สำเร็จก่อน)
      await disconnect.remove();
      if (cancelled) return;
      // แล้วค่อยเขียนว่าออนไลน์อยู่ เพื่อกัน race ที่หลุดก่อนลงทะเบียนเสร็จ
       await set(presenceRef, true);
    }

    register().catch((err) => console.error("usePresence error:", err));

    return () => {
      cancelled = true;
      disconnect.cancel();
      remove(presenceRef).catch(() => {});
    };
  }, [roomId, uid, enabled]);
}
