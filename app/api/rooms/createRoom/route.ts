import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { assertAuthed } from "@/app/lib/server/roomState";
import { assertIsAdmin } from "@/app/lib/server/admin";
import {
  MAX_GUESS_DURATION_MS,
  MAX_JOKER_COUNT,
  MAX_PLAYERS,
  MAX_ROUND_DURATION_MS,
  MAX_VOTE_DURATION_MS,
  MIN_GUESS_DURATION_MS,
  MIN_ROUND_DURATION_MS,
  MIN_VOTE_DURATION_MS,
} from "@/app/lib/server/constants";
import { ApiError } from "@/app/lib/server/errors";

const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomId(length = 4): string {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return id;
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();

    const name: string = body?.name?.trim();
    if (!name || name.length > 20) {
      throw new ApiError("invalid-argument", "ต้องระบุชื่อผู้เล่น (ไม่เกิน 20 ตัวอักษร)");
    }

    const requestedLocationId =
      typeof body?.locationId === "string" && body.locationId.length > 0
        ? body.locationId
        : undefined;
    const requestedSpyCount =
      typeof body?.spyCount === "number" && Number.isInteger(body.spyCount)
        ? body.spyCount
        : undefined;

    const requestedJokerCount =
      typeof body?.jokerCount === "number" && Number.isInteger(body.jokerCount)
        ? Math.max(0, Math.min(MAX_JOKER_COUNT, body.jokerCount))
        : undefined;

    const requestedRoundDuration =
      typeof body?.roundDuration === "number" && Number.isFinite(body.roundDuration)
        ? Math.max(MIN_ROUND_DURATION_MS, Math.min(MAX_ROUND_DURATION_MS, body.roundDuration))
        : undefined;

    const requestedVoteDuration =
      typeof body?.voteDuration === "number" && Number.isFinite(body.voteDuration)
        ? Math.max(MIN_VOTE_DURATION_MS, Math.min(MAX_VOTE_DURATION_MS, body.voteDuration))
        : undefined;

    const requestedGuessDuration =
      typeof body?.guessDuration === "number" && Number.isFinite(body.guessDuration)
        ? Math.max(MIN_GUESS_DURATION_MS, Math.min(MAX_GUESS_DURATION_MS, body.guessDuration))
        : undefined;

    let selectedLocationId: string | undefined;
    let spyCount: number | undefined;
    let jokerCount: number | undefined;

    if (requestedLocationId || requestedSpyCount !== undefined) {
      await assertIsAdmin(uid);
    }

    const db = adminDb;

    if (requestedLocationId) {
      const locSnap = await db.ref(`locations/${requestedLocationId}`).once("value");
      const loc = locSnap.val() as { active?: boolean } | null;
      if (!loc || loc.active !== true) {
        throw new ApiError("invalid-argument", "location ที่เลือกไม่มีอยู่หรือถูกปิดการใช้งาน");
      }
      selectedLocationId = requestedLocationId;
    }

    if (requestedSpyCount !== undefined) {
      if (requestedSpyCount < 1 || requestedSpyCount > MAX_PLAYERS - 1) {
        throw new ApiError(
          "invalid-argument",
          `จำนวน spy ต้องอยู่ระหว่าง 1 ถึง ${MAX_PLAYERS - 1}`,
        );
      }
      spyCount = requestedSpyCount;
    }

    if (requestedJokerCount !== undefined) {
      jokerCount = requestedJokerCount;
    }

    let roomId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateRoomId();
      const existing = await db.ref(`rooms/${candidate}`).once("value");
      if (!existing.exists()) {
        roomId = candidate;
        break;
      }
    }
    if (!roomId) {
      throw new ApiError("internal", "สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง");
    }

    const { ServerValue } = await import("firebase-admin/database");

    await db.ref(`rooms/${roomId}`).set({
      hostUid: uid,
      status: "lobby",
      createdAt: ServerValue.TIMESTAMP,
      ...(selectedLocationId ? { selectedLocationId } : {}),
      ...(spyCount !== undefined ? { spyCount } : {}),
      ...(jokerCount !== undefined ? { jokerCount } : {}),
      ...(requestedRoundDuration !== undefined ? { roundDuration: requestedRoundDuration } : {}),
      ...(requestedVoteDuration !== undefined ? { voteDuration: requestedVoteDuration } : {}),
      ...(requestedGuessDuration !== undefined ? { guessDuration: requestedGuessDuration } : {}),
      players: {
        [uid]: {
          name,
          online: true,
          joinedAt: ServerValue.TIMESTAMP,
        },
      },
    });

    return Response.json({ roomId });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
