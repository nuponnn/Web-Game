"use client";
import { useEffect, useMemo, useState } from "react";
import { getDatabase, ref, onValue } from "firebase/database";

// subscribe ทั้ง room object เดียว (public) + roomPrivate/{roomId}/{uid} (ของตัวเอง)
// แล้ว merge ข้อมูลลับของเราเข้าไปใน room เพื่อให้ View ใช้เหมือนเดิม
//
// หมายเหตุ: ข้อมูลลับ (location/role/isSpy/isJoker) ไม่ได้อยู่ใน rooms/{roomId} แล้ว
// เพราะ security rules cascade — rule ที่ parent อนุญาตแล้ว child rule กันไม่ได้
// ต้องแยกไปอยู่ roomPrivate/{roomId}/{uid} ซึ่งเปิดอ่านได้เฉพาะเจ้าของ
// (ดู functions/src/game/startGame.ts + database.rules.json)

export type Room = {
  hostUid: string;
  status: "lobby" | "playing" | "voting" | "reveal" | "ended";
  createdAt?: number;
  location?: string;
  locationId?: string;
  selectedLocationId?: string; // admin ตั้งไว้ตอนสร้างห้อง
  spyCount?: number; // จำนวน spy ที่ host/admin กำหนด (default 1)
  jokerCount?: number; // จำนวน joker ที่ host กำหนด (default 0, ช่วง 0-5)
  roundDuration?: number; // เวลาหา spy (ms) ที่ host กำหนด (default 8 นาที)
  voteDuration?: number; // เวลาโหวต (ms) ที่ host กำหนด (default 30 วินาที)
  players: Record<
    string,
    { name: string; online: boolean; isSpy?: boolean; isJoker?: boolean; role?: string; joinedAt: number }
  >;
  round?: { startedAt: number; duration: number; endsAt: number; voteEndsAt?: number };
  // voterUid -> { targetUid, votedAt } (targetUid = null หมายถึง skip)
  votes?: Record<string, { targetUid: string | null; votedAt: number }>;
  result?: { winner: "players" | "spy" | "joker"; spyUids: string[]; jokerUids: string[]; votedOutUid: string | null };
};

// ข้อมูลลับของเรา (จาก roomPrivate/{roomId}/{uid}) — merge เข้า room.players[uid] + room.location
export type MyPrivateData = {
  isSpy?: boolean;
  isJoker?: boolean;
  role?: string;
  location?: string;
};

export function useRoom(roomId: string | null, uid?: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [myPrivate, setMyPrivate] = useState<MyPrivateData | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [privLoaded, setPrivLoaded] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const db = getDatabase();

    // reset state ตอนเปลี่ยนห้อง/user กันข้อมูลเก่าค้าง
    setRoom(null);
    setMyPrivate(null);
    setRoomLoaded(false);
    setPrivLoaded(false);

    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubRoom = onValue(
      roomRef,
      (snap) => {
        if (cancelled) return;
        setRoom(snap.val() as Room | null);
        setRoomLoaded(true);
      },
      (error) => {
        // จะเจอ error ตรงนี้ถ้า security rules ปฏิเสธการอ่าน - ปกติของระบบ
        console.error("useRoom error:", error);
        setRoomLoaded(true);
      }
    );

    let unsubPriv: (() => void) | null = null;
    if (uid) {
      const privRef = ref(db, `roomPrivate/${roomId}/${uid}`);
      unsubPriv = onValue(
        privRef,
        (snap) => {
          if (cancelled) return;
          setMyPrivate(snap.val() as MyPrivateData | null);
          setPrivLoaded(true);
        },
        (error) => {
          if (cancelled) return;
          console.error("useRoom private error:", error);
          setPrivLoaded(true);
        }
      );
    } else {
      // ยังไม่มี uid (auth กำลังโหลด) -> ถือว่า private ว่างไว้ก่อน
      setPrivLoaded(true);
    }

    return () => {
      cancelled = true;
      unsubRoom();
      unsubPriv?.();
    };
  }, [roomId, uid]);

  // merge ข้อมูลลับของเราลงใน room: players[uid] ได้ isSpy/isJoker/role,
  // room.location ได้ค่าจาก private (ระหว่างเล่น) หรือค่าสาธารณะ (ตอน reveal)
  const mergedRoom = useMemo<Room | null>(() => {
    if (!room) return null;
    if (!uid || !myPrivate) return room;

    const players = { ...room.players };
    if (players[uid]) {
      players[uid] = {
        ...players[uid],
        isSpy: myPrivate.isSpy,
        isJoker: myPrivate.isJoker,
        role: myPrivate.role,
      };
    }

    return {
      ...room,
      // public location (เขียนตอน reveal ให้ทุกคนเห็น) ชนะก่อน; ระหว่างเล่นใช้ของตัวเอง
      location: room.location ?? myPrivate.location ?? undefined,
      players,
    };
  }, [room, myPrivate, uid]);

  return { room: mergedRoom, loading: !roomLoaded || !privLoaded };
}
