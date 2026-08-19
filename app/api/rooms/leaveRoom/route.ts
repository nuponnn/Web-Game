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

    const updates: Record<string, unknown> = {};
    updates[`rooms/${roomId}/players/${uid}`] = null;
    updates[`presence/${roomId}/${uid}`] = null;
    updates[`roomPrivate/${roomId}/${uid}`] = null;

    // ถ้าเป็น host ที่ออก ให้ลบห้องทั้งห้อง
    if (room.hostUid === uid) {
      updates[`rooms/${roomId}`] = null;
      updates[`presence/${roomId}`] = null;
      updates[`roomPrivate/${roomId}`] = null;
    }

    // ถ้าไม่เหลือใคร online เลย ให้ลบห้อง
    const otherPlayers = Object.entries(room.players).filter(
      ([pid, p]) => pid !== uid && p.online,
    );
    if (otherPlayers.length === 0 && room.hostUid !== uid) {
      updates[`rooms/${roomId}`] = null;
      updates[`presence/${roomId}`] = null;
      updates[`roomPrivate/${roomId}`] = null;
    }

    await adminDb.ref().update(updates);

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
