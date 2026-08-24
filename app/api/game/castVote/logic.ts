import { adminDb } from "@/app/lib/server/firebaseAdmin";
import {
  Room,
  RoundWinner,
} from "@/app/lib/server/roomState";
import {
  DEFAULT_GUESS_DURATION_MS,
  MAX_GUESS_DURATION_MS,
  MIN_GUESS_DURATION_MS,
} from "@/app/lib/server/constants";

interface PrivatePlayer {
  isSpy?: boolean;
  isJoker?: boolean;
  location?: string;
}

function tallyVotes(votes: Room["votes"]): string | null {
  const tally: Record<string, number> = {};
  Object.values(votes ?? {}).forEach((vote) => {
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
  if (isTie) return null;
  return votedOutUid;
}

export async function loadPrivatePlayers(
  roomId: string,
): Promise<Record<string, PrivatePlayer>> {
  const privateSnap = await adminDb.ref(`roomPrivate/${roomId}`).once("value");
  return (
    (privateSnap.val() as Record<string, PrivatePlayer> | null) || {}
  );
}

function getRoleLists(privateVal: Record<string, PrivatePlayer>) {
  const spyUids = Object.keys(privateVal).filter((id) => privateVal[id]?.isSpy);
  const jokerUids = Object.keys(privateVal).filter(
    (id) => privateVal[id]?.isJoker
  );
  return { spyUids, jokerUids };
}

// คำนวณผลจริงและเขียนลง rooms/{roomId} เพื่อเปิดหน้า reveal
export async function finalizeVote(
  roomId: string,
  room: Room,
  privateVal: Record<string, PrivatePlayer>,
) {
  const votedOutUid = tallyVotes(room.votes);
  const { spyUids, jokerUids } = getRoleLists(privateVal);

  const location =
    Object.values(privateVal).find((p) => p?.location)?.location ?? null;

  const guessedLocationName = room.guess?.locationName ?? null;
  const isCorrectGuess =
    guessedLocationName !== null && guessedLocationName === location;

  let winner: RoundWinner;
  if (spyUids.length === 0) {
    // spy ออกจากห้องไปหมด (leave ระหว่างโหวต) - จบเกมแบบ players ชนะ
    // แทนที่จะ throw internal error จน room ติด status voting/guessing ตลอดไป
    winner = "players";
  } else if (votedOutUid !== null && jokerUids.includes(votedOutUid)) {
    // Joker โดนโหวต: spy ทายถูก = spy + joker ชนะคู่ / ทายผิด = players ชนะ
    winner = isCorrectGuess ? "team" : "players";
  } else if (votedOutUid !== null && spyUids.includes(votedOutUid)) {
    // Spy โดนโหวต: spy ทายถูก = เสมอ / ทายผิด = players ชนะ
    winner = isCorrectGuess ? "draw" : "players";
  } else {
    // ไม่มีใครโดนโหวต หรือคนธรรมดาโดนโหวต = spy ชนะ
    winner = "spy";
  }

  await adminDb.ref(`rooms/${roomId}`).update({
    status: "reveal",
    location,
    result: { winner, spyUids, jokerUids, votedOutUid },
  });
}

export async function resolveVoteLogic(roomId: string, room: Room) {
  const votedOutUid = tallyVotes(room.votes);
  const privateVal = await loadPrivatePlayers(roomId);
  const { spyUids, jokerUids } = getRoleLists(privateVal);

  const caughtSpecialRole =
    votedOutUid !== null &&
    spyUids.length > 0 &&
    (spyUids.includes(votedOutUid) || jokerUids.includes(votedOutUid));

  if (!caughtSpecialRole) {
    await finalizeVote(roomId, room, privateVal);
    return;
  }

  // spy/joker โดนโหวต -> เข้าเฟสให้ spy เดาสถานที่ (ยังไม่เผย role/location)
  const guessDurationMs = Math.max(
    MIN_GUESS_DURATION_MS,
    Math.min(MAX_GUESS_DURATION_MS, room.guessDuration ?? DEFAULT_GUESS_DURATION_MS),
  );
  const guessEndsAt = Date.now() + guessDurationMs;

  // spy ที่มีสิทธิ์เดา: ถ้า spy โดนโหวต = เฉพาะคนที่โดน, ถ้า joker โดนโหวต = spy ทุกคน
  const eligibleGuessers = spyUids.includes(votedOutUid as string)
    ? [votedOutUid as string]
    : spyUids;

  const updates: Record<string, unknown> = {};
  eligibleGuessers.forEach((uid) => {
    updates[`roomPrivate/${roomId}/${uid}/canGuess`] = true;
  });
  updates[`rooms/${roomId}/status`] = "guessing";
  updates[`rooms/${roomId}/round/guessEndsAt`] = guessEndsAt;

  await adminDb.ref().update(updates);
}
