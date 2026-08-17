import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsPlayer,
  assertAuthed,
  Room,
} from "../lib/roomState";

export const castVote = onCall(async (request) => {
  const uid = request.auth?.uid;
  assertAuthed(uid);

  const roomId: string = request.data?.roomId;
  const targetUid: string = request.data?.targetUid;
  if (!roomId || !targetUid) {
    throw new HttpsError("invalid-argument", "ต้องระบุ roomId และ targetUid");
  }

  const room = await getRoomOrThrow(roomId);
  assertStatus(room, "voting");
  assertIsPlayer(room, uid);

  if (!room.players[targetUid]) {
    throw new HttpsError("invalid-argument", "โหวตคนที่ไม่ได้อยู่ในห้องไม่ได้");
  }

  const db = admin.database();

  // ห้ามโหวตซ้ำ: ใช้ transaction กันกรณี double-click / race condition
  // เก็บเป็น object { targetUid, votedAt } เพื่อให้รู้ว่าโหวตตอนไหน
  const votedAt = Date.now();
  const voteRef = db.ref(`rooms/${roomId}/votes/${uid}`);
  const result = await voteRef.transaction((current) => {
    if (current !== null) return; // มีค่าอยู่แล้ว = โหวตไปแล้ว ยกเลิก write
    return { targetUid, votedAt };
  });

  if (!result.committed) {
    throw new HttpsError("already-exists", "คุณโหวตไปแล้ว");
  }

  // เช็คว่าโหวตครบทุกคนหรือยัง ถ้าครบ resolve ทันที
  const freshRoomSnap = await db.ref(`rooms/${roomId}`).once("value");
  const freshRoom = freshRoomSnap.val() as Room;
  const totalPlayers = Object.keys(freshRoom.players).length;
  const totalVotes = Object.keys(freshRoom.votes || {}).length;

  if (totalVotes >= totalPlayers) {
    await resolveVote(roomId, freshRoom);
  }

  return { ok: true, votesSoFar: totalVotes, totalPlayers };
});

// แยก logic การตัดสินผลไว้เป็นฟังก์ชันใช้ซ้ำได้ (เรียกจากที่นี่ หรือจาก scheduled timeout ก็ได้)
export async function resolveVote(roomId: string, room: Room) {
  const votes = room.votes || {};
  const tally: Record<string, number> = {};
  Object.values(votes).forEach((vote) => {
    tally[vote.targetUid] = (tally[vote.targetUid] || 0) + 1;
  });

  // หาคนที่โดนโหวตมากที่สุด (ถ้าเสมอกันหลายคน ให้ถือว่าผู้เล่นแพ้ - จับตัวไม่ได้ชัดเจน)
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

  // ตรวจว่าโดนโหวตออกเป็น spy หรือไม่ (spy มีได้หลายคน)
  const spyUids = Object.keys(room.players).filter((id) => room.players[id].isSpy);
  if (spyUids.length === 0) {
    throw new HttpsError(
      "internal",
      "ไม่พบผู้เล่นที่เป็น spy ในห้องนี้ (ข้อมูลห้องผิดปกติ)"
    );
  }

  const votedOutIsSpy = votedOutUid !== null && spyUids.includes(votedOutUid);
  const winner: "players" | "spy" = votedOutIsSpy ? "players" : "spy";

  await admin.database().ref(`rooms/${roomId}`).update({
    status: "reveal",
    result: { winner, spyUids, votedOutUid },
  });
}
