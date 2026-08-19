import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { getRoomOrThrow, assertStatus, assertAuthed } from "@/app/lib/server/roomState";
import { MAX_PLAYERS } from "@/app/lib/server/constants";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId?.toUpperCase();
    const name: string = body?.name?.trim();
    if (!roomId || !name) {
      throw new ApiError("invalid-argument", "ต้องระบุ roomId และชื่อผู้เล่น");
    }

    const room = await getRoomOrThrow(roomId);
    assertStatus(room, "lobby");

    const currentPlayers = room.players ? Object.values(room.players) : [];
    if (currentPlayers.length >= MAX_PLAYERS) {
      throw new ApiError("resource-exhausted", "ห้องเต็มแล้ว");
    }

    const nameTaken = currentPlayers.some((p) => p.name === name);
    if (nameTaken) {
      throw new ApiError("already-exists", "มีคนใช้ชื่อนี้ในห้องแล้ว");
    }

    const { ServerValue } = await import("firebase-admin/database");

    await adminDb
      .ref(`rooms/${roomId}/players/${uid}`)
      .set({
        name,
        online: true,
        joinedAt: ServerValue.TIMESTAMP,
      });

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
