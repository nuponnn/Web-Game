import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { getRoomOrThrow, assertIsHost, assertAuthed } from "@/app/lib/server/roomState";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    if (!roomId) throw new ApiError("invalid-argument", "ต้องระบุ roomId");

    const room = await getRoomOrThrow(roomId);
    assertIsHost(room, uid);

    const updates: Record<string, unknown> = {};
    Object.keys(room.players || {}).forEach((playerUid) => {
      updates[`rooms/${roomId}/players/${playerUid}/isSpy`] = null;
      updates[`rooms/${roomId}/players/${playerUid}/isJoker`] = null;
      updates[`rooms/${roomId}/players/${playerUid}/role`] = null;
    });

    await adminDb.ref().update({
      ...updates,
      [`rooms/${roomId}/status`]: "lobby",
      [`rooms/${roomId}/round`]: null,
      [`rooms/${roomId}/votes`]: null,
      [`rooms/${roomId}/result`]: null,
      [`roomPrivate/${roomId}`]: null,
    });

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
