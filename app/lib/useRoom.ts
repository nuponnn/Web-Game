"use client";
import { useEffect, useState } from "react";
import { getDatabase, ref, onValue } from "firebase/database";

// subscribe ทั้ง room object เดียว ง่ายสุดสำหรับ MVP
// (ถ้าห้องใหญ่ขึ้น/ข้อมูลเยอะขึ้น ค่อยแยก subscribe เป็นราย path ตามที่วางแผนไว้ก่อนหน้า)

// type ให้ตรงกับโครงสร้างที่ backend เขียนไว้ (functions/src/lib/roomState.ts)
// สาเหตุที่ก่อนหน้านี้ room ติด "never": useState(null) ทำให้ type เป็นแค่ null
// พอตรวจ !room แล้ว TS มองว่าเหลือแต่ค่า null -> ยืนยันว่า "ไม่มีค่า" เสมอ
// ต้องประกาศ useState<Room | null> เพื่อให้ตอนตรวจ !room แล้วได้ type Room แทน
export type Room = {
  hostUid: string;
  status: "lobby" | "playing" | "voting" | "reveal" | "ended";
  createdAt?: number;
  location?: string;
  locationId?: string;
  selectedLocationId?: string; // admin ตั้งไว้ตอนสร้างห้อง
  spyCount?: number; // จำนวน spy ที่ host/admin กำหนด (default 1)
  roundDuration?: number; // เวลาหา spy (ms) ที่ host กำหนด (default 8 นาที)
  voteDuration?: number; // เวลาโหวต (ms) ที่ host กำหนด (default 30 วินาที)
  players: Record<
    string,
    { name: string; online: boolean; isSpy?: boolean; role?: string; joinedAt: number }
  >;
  round?: { startedAt: number; duration: number; endsAt: number; voteEndsAt?: number };
  // voterUid -> { targetUid, votedAt }
  votes?: Record<string, { targetUid: string; votedAt: number }>;
  result?: { winner: "players" | "spy"; spyUids: string[]; votedOutUid: string | null };
};

export function useRoom(roomId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    

    const roomRef = ref(getDatabase(), `rooms/${roomId}`);
    const unsub = onValue(
      roomRef,
      (snap) => {
        setRoom(snap.val() as Room | null);
        setLoading(false);
      },
      (error) => {
        // จะเจอ error ตรงนี้ถ้า security rules ปฏิเสธการอ่าน เช่น
        // พยายามอ่าน location ทั้งที่เป็นสปาย - ปกติของระบบ ไม่ต้อง alert user
        console.error("useRoom error:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [roomId]);

  return { room, loading };
}
