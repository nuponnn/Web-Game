import { adminDb } from "./firebaseAdmin";
import { ApiError } from "./errors";

export type RoomStatus =
  | "lobby"
  | "playing"
  | "voting"
  | "guessing"
  | "reveal"
  | "ended";

export type RoundWinner = "players" | "spy" | "draw" | "team";

export interface Player {
  name: string;
  online: boolean;
  isSpy?: boolean;
  isJoker?: boolean;
  role?: string;
  joinedAt: number;
}

export interface Room {
  hostUid: string;
  status: RoomStatus;
  location?: string;
  locationId?: string;
  selectedLocationId?: string;
  spyCount?: number;
  jokerCount?: number;
  roundDuration?: number;
  voteDuration?: number;
  guessDuration?: number;
  players: Record<string, Player>;
  round?: {
    roundId?: string;
    startedAt: number;
    duration: number;
    endsAt: number;
    voteEndsAt?: number;
    guessEndsAt?: number;
  };
  votes?: Record<string, { targetUid: string | null; votedAt: number }>;
  guess?: {
    locationName: string;
    guessedBy: string;
    guessedAt: number;
  };
  result?: {
    winner: RoundWinner;
    spyUids: string[];
    jokerUids: string[];
    votedOutUid: string | null;
  };
}

export function roomRef(roomId: string) {
  return adminDb.ref(`rooms/${roomId}`);
}

export async function getRoomOrThrow(roomId: string): Promise<Room> {
  const snap = await roomRef(roomId).once("value");
  const room = snap.val() as Room | null;
  if (!room) {
    throw new ApiError("not-found", `ไม่พบห้อง ${roomId}`);
  }
  return room;
}

export function assertStatus(room: Room, expected: RoomStatus) {
  if (room.status !== expected) {
    throw new ApiError(
      "failed-precondition",
      `ห้องนี้อยู่ในสถานะ "${room.status}" แต่ action นี้ต้องการสถานะ "${expected}"`,
    );
  }
}

export function assertIsHost(room: Room, uid: string) {
  if (room.hostUid !== uid) {
    throw new ApiError("permission-denied", "เฉพาะ host เท่านั้นที่ทำ action นี้ได้");
  }
}

export function assertIsPlayer(room: Room, uid: string) {
  if (!room.players || !room.players[uid]) {
    throw new ApiError("permission-denied", "คุณไม่ได้อยู่ในห้องนี้");
  }
}

export function assertAuthed(uid: string | undefined): asserts uid is string {
  if (!uid) {
    throw new ApiError("unauthenticated", "ต้อง login (anonymous) ก่อนใช้งาน");
  }
}
