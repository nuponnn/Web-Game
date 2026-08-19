import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsHost,
  assertAuthed,
} from "@/app/lib/server/roomState";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    const targetUid: string = body?.targetUid;
    if (!roomId || !targetUid) {
      throw new ApiError("invalid-argument", "ต้องระบุ roomId และ targetUid");
    }

    const room = await getRoomOrThrow(roomId);
    assertStatus(room, "lobby");
    assertIsHost(room, uid);

    if (targetUid === uid) {
      throw new ApiError("failed-precondition", "เตะตัวเองไม่ได้");
    }

    if (!room.players || !room.players[targetUid]) {
      throw new ApiError("not-found", "ไม่พบผู้เล่นนี้ในห้อง");
    }

    const updates: Record<string, unknown> = {};
    updates[`rooms/${roomId}/players/${targetUid}`] = null;
    updates[`presence/${roomId}/${targetUid}`] = null;
    updates[`roomPrivate/${roomId}/${targetUid}`] = null;

    await adminDb.ref().update(updates);

    return Response.json({ ok: true, kickedName: room.players[targetUid].name });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
