import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsPlayer,
  assertAuthed,
} from "@/app/lib/server/roomState";
import {
  DEFAULT_VOTE_DURATION_MS,
  MAX_VOTE_DURATION_MS,
  MIN_VOTE_DURATION_MS,
} from "@/app/lib/server/constants";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    const reason: "timeout" | "host_ended" = body?.reason ?? "timeout";
    if (!roomId) throw new ApiError("invalid-argument", "ต้องระบุ roomId");

    const room = await getRoomOrThrow(roomId);
    assertStatus(room, "playing");
    assertIsPlayer(room, uid);

    if (reason === "host_ended") {
      if (room.hostUid !== uid) {
        throw new ApiError("permission-denied", "เฉพาะ host กดจบก่อนเวลาได้");
      }
    } else {
      const serverNow = Date.now();
      const endsAt = room.round?.endsAt ?? 0;
      if (serverNow < endsAt) {
        throw new ApiError(
          "failed-precondition",
          "ยังไม่หมดเวลา ไม่สามารถจบรอบได้",
        );
      }
    }

    const voteDurationMs = Math.max(
      MIN_VOTE_DURATION_MS,
      Math.min(MAX_VOTE_DURATION_MS, room.voteDuration ?? DEFAULT_VOTE_DURATION_MS),
    );

    const voteEndsAt = Date.now() + voteDurationMs;

    await adminDb.ref(`rooms/${roomId}`).update({
      "status": "voting",
      "round/voteEndsAt": voteEndsAt,
    });

    return Response.json({ ok: true, voteEndsAt });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
