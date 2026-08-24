import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsPlayer,
  assertAuthed,
  Room,
} from "@/app/lib/server/roomState";
import { ApiError } from "@/app/lib/server/errors";
import { finalizeVote, loadPrivatePlayers } from "../castVote/logic";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    const locationName: unknown = body?.locationName;
    if (!roomId) throw new ApiError("invalid-argument", "ต้องระบุ roomId");
    if (typeof locationName !== "string" || locationName.trim().length === 0) {
      throw new ApiError("invalid-argument", "ต้องระบุสถานที่ที่จะเดา");
    }

    const room = await getRoomOrThrow(roomId);
    assertStatus(room, "guessing");
    assertIsPlayer(room, uid);

    // ต้องเป็น spy ที่ได้รับสิทธิ์ (canGuess เขียนลง roomPrivate เฉพาะคน) — ไม่ leak role
    const myPrivateSnap = await adminDb
      .ref(`roomPrivate/${roomId}/${uid}`)
      .once("value");
    const myPrivate = myPrivateSnap.val() as
      | { isSpy?: boolean; canGuess?: boolean }
      | null;
    if (!myPrivate?.isSpy || !myPrivate.canGuess) {
      throw new ApiError(
        "permission-denied",
        "คุณไม่ใช่คนที่มีสิทธิ์เดาสถานที่ในตานี้",
      );
    }

    if (room.guess) {
      throw new ApiError("failed-precondition", "มีการเดาไปแล้วในตานี้");
    }

    // transaction set-if-absent: กัน spy หลายคนกดพร้อมกัน
    // (หรือแข่งกับ resolveGuess ตอนหมดเวลา) ให้ commit ได้แค่คำตอบเดียว
    const guessedAt = Date.now();
    const attempt = await adminDb
      .ref(`rooms/${roomId}/guess`)
      .transaction((current) =>
        current === null
          ? {
              locationName: locationName.trim(),
              guessedBy: uid,
              guessedAt,
            }
          : undefined, // abort - มีคนเดาไปก่อนแล้ว
      );

    if (!attempt.committed) {
      throw new ApiError("failed-precondition", "มีการเดาไปแล้วในตานี้");
    }

    const freshRoomSnap = await adminDb.ref(`rooms/${roomId}`).once("value");
    const freshRoom = freshRoomSnap.val() as Room;
    if (freshRoom?.status !== "guessing") {
      // resolveGuess ตัดสินไปก่อนแล้ว (timeout) - ไม่ทับผลที่ประกาศไปแล้ว
      return Response.json({ ok: true, resolvedByTimeout: true });
    }
    const privateVal = await loadPrivatePlayers(roomId);
    await finalizeVote(roomId, freshRoom, privateVal);

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
