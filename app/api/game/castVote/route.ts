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
import { resolveVoteLogic } from "./logic";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    const targetUid: string | null = body?.targetUid ?? null;
    if (!roomId) {
      throw new ApiError("invalid-argument", "ต้องระบุ roomId");
    }

    const room = await getRoomOrThrow(roomId);
    assertStatus(room, "voting");
    assertIsPlayer(room, uid);

    if (targetUid !== null && !room.players[targetUid]) {
      throw new ApiError("invalid-argument", "โหวตคนที่ไม่ได้อยู่ในห้องไม่ได้");
    }

    const votedAt = Date.now();
    await adminDb.ref(`rooms/${roomId}/votes/${uid}`).set({ targetUid, votedAt });

    const freshRoomSnap = await adminDb.ref(`rooms/${roomId}`).once("value");
    const freshRoom = freshRoomSnap.val() as Room;
    const totalPlayers = Object.keys(freshRoom.players).length;
    const allVotes = freshRoom.votes || {};
    const totalVotes = Object.keys(allVotes).length;

    if (totalVotes >= totalPlayers) {
      await resolveVoteLogic(roomId, freshRoom);
    }

    return Response.json({ ok: true, votesSoFar: totalVotes, totalPlayers });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
