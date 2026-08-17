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
  const targetUid: string | null = request.data?.targetUid ?? null;
  if (!roomId) {
    throw new HttpsError("invalid-argument", "ต้องระบุ roomId");
  }

  const room = await getRoomOrThrow(roomId);
  assertStatus(room, "voting");
  assertIsPlayer(room, uid);

  // ถ้าโหวตคน (ไม่ใช่ skip) ต้องเป็นผู้เล่นในห้อง
  if (targetUid !== null && !room.players[targetUid]) {
    throw new HttpsError("invalid-argument", "โหวตคนที่ไม่ได้อยู่ในห้องไม่ได้");
  }

  const db = admin.database();

  // อนุญาตให้เปลี่ยนโหวตได้: set เขียนทับค่าเดิม (ไม่ block โหวตซ้ำ)
  const votedAt = Date.now();
  const voteRef = db.ref(`rooms/${roomId}/votes/${uid}`);
  await voteRef.set({ targetUid, votedAt });

  // เช็คว่าโหวตครบทุกคนหรือยัง (นับทุกคนรวม skip)
  const freshRoomSnap = await db.ref(`rooms/${roomId}`).once("value");
  const freshRoom = freshRoomSnap.val() as Room;
  const totalPlayers = Object.keys(freshRoom.players).length;
  const allVotes = freshRoom.votes || {};
  const totalVotes = Object.keys(allVotes).length;

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
    // ข้าม skip vote (targetUid เป็น null)
    if (vote.targetUid == null) return;
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

  // ตรวจ role ของผู้เล่นที่โดนโหวต — อ่านจาก roomPrivate/{roomId}/{uid}
  // (isSpy/isJoker ไม่ได้อยู่ใน public room แล้ว อยู่ private ต่อผู้เล่น)
  const db = admin.database();
  const privateSnap = await db.ref(`roomPrivate/${roomId}`).once("value");
  const privateVal = (privateSnap.val() as
    | Record<string, { isSpy?: boolean; isJoker?: boolean; location?: string }>
    | null) || {};

  const spyUids = Object.keys(privateVal).filter((id) => privateVal[id]?.isSpy);
  const jokerUids = Object.keys(privateVal).filter((id) => privateVal[id]?.isJoker);

  if (spyUids.length === 0) {
    throw new HttpsError(
      "internal",
      "ไม่พบผู้เล่นที่เป็น spy ในห้องนี้ (ข้อมูลห้องผิดปกติ)"
    );
  }

  // หาชื่อสถานที่จาก private ของคนที่ไม่ใช่ spy (จบเกมแล้ว -> เปิดให้ทุกคนเห็นได้)
  // เผื่อ location ถูกลบไปจากลิสต์ระหว่างเล่น ยังมีชื่อเก็บไว้ใน private
  const location =
    Object.values(privateVal).find((p) => p?.location)?.location ?? null;

  // ตัดสินผล:
  // - joker โดนโหวตออก -> joker ชนะ
  // - spy โดนโหวตออก -> ผู้เล่นชนะ
  // - ไม่ใช่ทั้งคู่ หรือเสมอ -> spy ชนะ
  let winner: "players" | "spy" | "joker";
  if (votedOutUid !== null && jokerUids.includes(votedOutUid)) {
    winner = "joker";
  } else {
    const votedOutIsSpy = votedOutUid !== null && spyUids.includes(votedOutUid);
    winner = votedOutIsSpy ? "players" : "spy";
  }

  await db.ref(`rooms/${roomId}`).update({
    status: "reveal",
    // เขียน location ลง public room เฉพาะตอนจบเกม เพื่อให้ทุกคน (รวม spy) เห็น
    location,
    result: { winner, spyUids, jokerUids, votedOutUid },
  });
}
