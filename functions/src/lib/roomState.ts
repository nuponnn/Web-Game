import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

export type RoomStatus = "lobby" | "playing" | "voting" | "reveal" | "ended";

export interface Player {
  name: string;
  online: boolean;
  isSpy?: boolean;
  role?: string;
  joinedAt: number;
}

export interface Room {
  hostUid: string;
  status: RoomStatus;
  location?: string;
  locationId?: string;
  selectedLocationId?: string; // admin ตั้งไว้ตอนสร้างห้อง (ก่อน start ยังแก้ได้ใน Lobby)
  spyCount?: number; // จำนวน spy ที่ host กำหนด (default 1)
  roundDuration?: number; // เวลาหา spy (ms) ที่ host กำหนด (default 8 นาที)
  voteDuration?: number; // เวลาโหวต (ms) ที่ host กำหนด (default 30 วินาที)
  players: Record<string, Player>;
  round?: {
    startedAt: number;
    duration: number;
    endsAt: number;
    voteEndsAt?: number;
  };
  // voterUid -> { targetUid, votedAt } (มี timestamp กำกับเวลาโหวต)
  votes?: Record<string, { targetUid: string; votedAt: number }>;
  result?: {
    winner: "players" | "spy";
    spyUids: string[]; // spy มีได้หลายคน (host/admin กำหนดได้)
    votedOutUid: string | null;
  };
}

export function roomRef(roomId: string) {
  return admin.database().ref(`rooms/${roomId}`);
}

// ดึงข้อมูลห้อง พร้อม throw error มาตรฐานถ้าไม่เจอ
export async function getRoomOrThrow(roomId: string): Promise<Room> {
  const snap = await roomRef(roomId).once("value");
  const room = snap.val() as Room | null;
  if (!room) {
    throw new HttpsError("not-found", `ไม่พบห้อง ${roomId}`);
  }
  return room;
}

// ตรวจสอบว่า status ของห้องตรงกับที่คาดหวังไหม ใช้ทุก function ที่เปลี่ยน state
export function assertStatus(room: Room, expected: RoomStatus) {
  if (room.status !== expected) {
    throw new HttpsError(
      "failed-precondition",
      `ห้องนี้อยู่ในสถานะ "${room.status}" แต่ action นี้ต้องการสถานะ "${expected}"`
    );
  }
}

export function assertIsHost(room: Room, uid: string) {
  if (room.hostUid !== uid) {
    throw new HttpsError("permission-denied", "เฉพาะ host เท่านั้นที่ทำ action นี้ได้");
  }
}

export function assertIsPlayer(room: Room, uid: string) {
  if (!room.players || !room.players[uid]) {
    throw new HttpsError("permission-denied", "คุณไม่ได้อยู่ในห้องนี้");
  }
}

export function assertAuthed(uid: string | undefined): asserts uid is string {
  if (!uid) {
    throw new HttpsError("unauthenticated", "ต้อง login (anonymous) ก่อนใช้งาน");
  }
}
