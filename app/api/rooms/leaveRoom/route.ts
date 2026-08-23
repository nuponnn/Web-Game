import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { getRoomOrThrow, assertIsPlayer, assertAuthed } from "@/app/lib/server/roomState";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    if (!roomId) throw new ApiError("invalid-argument", "ต้องระบุ roomId");

    const room = await getRoomOrThrow(roomId);
    assertIsPlayer(room, uid);

    const otherPlayers = Object.entries(room.players).filter(
      ([pid, p]) => pid !== uid && p.online,
    );
    const shouldCloseRoom = room.hostUid === uid || otherPlayers.length === 0;
    const updates: Record<string, unknown> = shouldCloseRoom
      ? {
          [`rooms/${roomId}`]: null,
          [`presence/${roomId}`]: null,
          [`roomPrivate/${roomId}`]: null,
        }
      : {
          [`rooms/${roomId}/players/${uid}`]: null,
          [`presence/${roomId}/${uid}`]: null,
          [`roomPrivate/${roomId}/${uid}`]: null,
          // ล้างโหวตค้างของตัวเอง กันนับ totalVotes เกิน totalPlayers ตอน resolve
          [`rooms/${roomId}/votes/${uid}`]: null,
        };

    await adminDb.ref().update(updates);

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
