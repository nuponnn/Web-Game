import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { Room } from "@/app/lib/server/roomState";
import { ApiError } from "@/app/lib/server/errors";

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
