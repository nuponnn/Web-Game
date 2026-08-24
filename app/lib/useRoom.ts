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
  status: "lobby" | "playing" | "voting" | "guessing" | "reveal" | "ended";
  createdAt?: number;
  location?: string;
  locationId?: string;
  selectedLocationId?: string; // admin ตั้งไว้ตอนสร้างห้อง
  spyCount?: number; // จำนวน spy ที่ host/admin กำหนด (default 1)
  jokerCount?: number; // จำนวน joker ที่ host กำหนด (default 0, ช่วง 0-5)
  roundDuration?: number; // เวลาหา spy (ms) ที่ host กำหนด (default 8 นาที)
  voteDuration?: number; // เวลาโหวต (ms) ที่ host กำหนด (default 30 วินาที)
  guessDuration?: number; // เวลาให้ spy เดาสถานที่ (ms) ที่ host กำหนด (default 30 วินาที)
  players: Record<
    string,
    { name: string; online: boolean; isSpy?: boolean; isJoker?: boolean; role?: string; canGuess?: boolean; joinedAt: number }
  >;
  round?: { roundId?: string; startedAt: number; duration: number; endsAt: number; voteEndsAt?: number; guessEndsAt?: number };
  // voterUid -> { targetUid, votedAt } (targetUid = null หมายถึง skip)
  votes?: Record<string, { targetUid: string | null; votedAt: number }>;
  // คำตอบของ spy ตอนเฟสเดาสถานที่ (public แต่ไม่บอกว่าถูก/ผิดจนกว่า reveal)
  guess?: { locationName: string; guessedBy: string; guessedAt: number };
  result?: {
    winner: "players" | "spy" | "draw" | "team";
    spyUids: string[];
    jokerUids: string[];
    votedOutUid: string | null;
  };
};

// ข้อมูลลับของเรา (จาก roomPrivate/{roomId}/{uid}) — merge เข้า room.players[uid] + room.location
export type MyPrivateData = {
  roundId?: string;
  isSpy?: boolean;
  isJoker?: boolean;
  role?: string;
  location?: string;
  canGuess?: boolean; // true = เราได้สิทธิ์เดาสถานที่ในเฟส guessing
};

export function useRoom(roomId: string | null, uid?: string | null) {
  const [roomState, setRoomState] = useState<{
    key: string | null;
    loaded: boolean;
    value: Room | null;
  }>({ key: null, loaded: false, value: null });
  const [privateState, setPrivateState] = useState<{
    key: string | null;
    loaded: boolean;
    value: MyPrivateData | null;
  }>({ key: null, loaded: false, value: null });

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const db = getDatabase();

    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubRoom = onValue(
      roomRef,
      (snap) => {
        if (cancelled) return;
        setRoomState({ key: roomId, loaded: true, value: snap.val() as Room | null });
      },
      (error) => {
        // จะเจอ error ตรงนี้ถ้า security rules ปฏิเสธการอ่าน - ปกติของระบบ
        console.error("useRoom error:", error);
        setRoomState({ key: roomId, loaded: true, value: null });
      }
    );

    return () => {
      cancelled = true;
      unsubRoom();
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !uid) return;
    let cancelled = false;
    const db = getDatabase();
    const privateKey = `${roomId}:${uid}`;
    const privRef = ref(db, `roomPrivate/${roomId}/${uid}`);

    const unsubPriv = onValue(
      privRef,
      (snap) => {
        if (cancelled) return;
        setPrivateState({
          key: privateKey,
          loaded: true,
          value: snap.val() as MyPrivateData | null,
        });
      },
      (error) => {
        if (cancelled) return;
        console.error("useRoom private error:", error);
        setPrivateState({ key: privateKey, loaded: true, value: null });
      }
    );

    return () => {
      cancelled = true;
      unsubPriv();
    };
  }, [roomId, uid]);

  const roomLoaded = !!roomId && roomState.key === roomId && roomState.loaded;
  const room = roomLoaded ? roomState.value : null;
  const privateKey = roomId && uid ? `${roomId}:${uid}` : null;
  const privLoaded = !uid || (privateState.key === privateKey && privateState.loaded);
  const myPrivate = privLoaded && privateState.key === privateKey ? privateState.value : null;
  const privateMatchesRound =
    !!myPrivate &&
    (!room?.round?.roundId || !myPrivate.roundId || myPrivate.roundId === room.round.roundId);

  // merge ข้อมูลลับของเราลงใน room: players[uid] ได้ isSpy/isJoker/role,
  // room.location ได้ค่าจาก private (ระหว่างเล่น) หรือค่าสาธารณะ (ตอน reveal)
  const mergedRoom = useMemo<Room | null>(() => {
    if (!room) return null;
    if (!uid || !myPrivate || !privateMatchesRound) return room;

    const players = { ...room.players };
    if (players[uid]) {
      players[uid] = {
        ...players[uid],
        isSpy: myPrivate.isSpy,
        isJoker: myPrivate.isJoker,
        role: myPrivate.role,
        canGuess: myPrivate.canGuess,
      };
    }

    return {
      ...room,
      // public location (เขียนตอน reveal ให้ทุกคนเห็น) ชนะก่อน; ระหว่างเล่นใช้ของตัวเอง
      location: room.location ?? myPrivate.location ?? undefined,
      players,
    };
  }, [room, myPrivate, privateMatchesRound, uid]);

  const needsPrivateState =
    (room?.status === "playing" || room?.status === "guessing" || room?.status === "reveal") &&
    !!uid &&
    !!room.players?.[uid] &&
    !privateMatchesRound;

  return { room: mergedRoom, loading: !roomLoaded || !privLoaded || needsPrivateState };
}
