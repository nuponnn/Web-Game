import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsPlayer,
  assertAuthed,
} from "@/app/lib/server/roomState";
import { resolveVoteLogic } from "@/app/api/game/castVote/route";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    if (!roomId) throw new ApiError("invalid-argument", "ต้องระบุ roomId");

    const room = await getRoomOrThrow(roomId);
    assertStatus(room, "voting");
    assertIsPlayer(room, uid);

    const serverNow = Date.now();
    const voteEndsAt = room.round?.voteEndsAt ?? 0;
    const totalPlayers = Object.keys(room.players).length;
    const totalVotes = Object.keys(room.votes || {}).length;
    const voteComplete = totalVotes >= totalPlayers;
    const voteExpired = serverNow >= voteEndsAt;

    if (!voteComplete && !voteExpired) {
      throw new ApiError(
        "failed-precondition",
        "ยังไม่หมดเวลาโหวตและยังโหวตไม่ครบ",
      );
    }

    await resolveVoteLogic(roomId, room);

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
