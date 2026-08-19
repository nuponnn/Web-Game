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

// resolveVote logic — นับคะแนนและตัดสินผลโหวต
// export ไว้ให้ resolveVote route เรียกซ้ำได้
export async function resolveVoteLogic(roomId: string, room: Room) {
  const votes = room.votes || {};
  const tally: Record<string, number> = {};
  Object.values(votes).forEach((vote) => {
    if (vote.targetUid == null) return;
    tally[vote.targetUid] = (tally[vote.targetUid] || 0) + 1;
  });

  let votedOutUid: string | null = null;
  let maxVotes = 0;
  let isTie = false;
  Object.entries(tally).forEach(([targetUid, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      votedOutUid = targetUid;
      isTie = false;
    } else if (count === maxVotes) {
      isTie = true;
    }
  });
  if (isTie) votedOutUid = null;

  const privateSnap = await adminDb.ref(`roomPrivate/${roomId}`).once("value");
  const privateVal = (privateSnap.val() as
    | Record<string, { isSpy?: boolean; isJoker?: boolean; location?: string }>
    | null) || {};

  const spyUids = Object.keys(privateVal).filter((id) => privateVal[id]?.isSpy);
  const jokerUids = Object.keys(privateVal).filter((id) => privateVal[id]?.isJoker);

  if (spyUids.length === 0) {
    throw new ApiError(
      "internal",
      "ไม่พบผู้เล่นที่เป็น spy ในห้องนี้ (ข้อมูลห้องผิดปกติ)",
    );
  }

  const location =
    Object.values(privateVal).find((p) => p?.location)?.location ?? null;

  let winner: "players" | "spy" | "joker";
  if (votedOutUid !== null && jokerUids.includes(votedOutUid)) {
    winner = "joker";
  } else {
    const votedOutIsSpy = votedOutUid !== null && spyUids.includes(votedOutUid);
    winner = votedOutIsSpy ? "players" : "spy";
  }

  await adminDb.ref(`rooms/${roomId}`).update({
    status: "reveal",
    location,
    result: { winner, spyUids, jokerUids, votedOutUid },
  });
}

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
