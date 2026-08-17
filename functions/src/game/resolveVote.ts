import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsPlayer,
  assertAuthed,
} from "../lib/roomState";
import { resolveVote as resolveVoteLogic } from "./castVote";

// เรียกเมื่อหมดเวลาโหวต (voteEndsAt) หรือโหวตครบทุกคน
// ทำหน้าที่ตัดสินผลโหวตและเปลี่ยนสถานะเป็น "reveal"
export const resolveVote = onCall(async (request) => {
  const uid = request.auth?.uid;
  assertAuthed(uid);

  const roomId: string = request.data?.roomId;
  if (!roomId) throw new HttpsError("invalid-argument", "ต้องระบุ roomId");

  const room = await getRoomOrThrow(roomId);
  assertStatus(room, "voting");
  assertIsPlayer(room, uid);

  // ต้องหมดเวลาโหวตแล้ว หรือโหวตครบทุกคนแล้วเท่านั้น
  // เพื่อกันคนกดข้ามขั้นตอนก่อนหมดเวลา
  const serverNow = Date.now();
  const voteEndsAt = room.round?.voteEndsAt ?? 0;
  const totalPlayers = Object.keys(room.players).length;
  const totalVotes = Object.keys(room.votes || {}).length;
  const voteComplete = totalVotes >= totalPlayers;
  const voteExpired = serverNow >= voteEndsAt;

  if (!voteComplete && !voteExpired) {
    throw new HttpsError(
      "failed-precondition",
      "ยังไม่หมดเวลาโหวตและยังโหวตไม่ครบ"
    );
  }

  // เรียก logic ตัดสินผล (reuse จาก castVote.ts)
  await resolveVoteLogic(roomId, room);

  return { ok: true };
});
