import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsPlayer,
  assertAuthed,
} from "@/app/lib/server/roomState";
import { ApiError } from "@/app/lib/server/errors";
import { finalizeVote, loadPrivatePlayers } from "../castVote/logic";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    if (!roomId) throw new ApiError("invalid-argument", "ต้องระบุ roomId");

    const room = await getRoomOrThrow(roomId);
    assertStatus(room, "guessing");
    assertIsPlayer(room, uid);

    const serverNow = Date.now();
    const guessEndsAt = room.round?.guessEndsAt ?? 0;
    const guessExpired = serverNow >= guessEndsAt;

    if (!room.guess && !guessExpired) {
      throw new ApiError(
        "failed-precondition",
        "ยังไม่หมดเวลาเดาสถานที่",
      );
    }

    const privateVal = await loadPrivatePlayers(roomId);
    await finalizeVote(roomId, room, privateVal);

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
