import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getRoomOrThrow, assertIsHost, assertAuthed } from "../lib/roomState";

// กลับเข้าห้อง (LobbyView) เพื่อเล่นรอบใหม่โดยไม่ต้องสร้างห้องใหม่
// ล้างของที่เหลือจากรอบที่แล้ว (สปาย/บทบาท/เวลา/โหวต/ผล) แต่เก็บผู้เล่น
// และ selectedLocationId/spyCount ไว้ให้ host เริ่มรอบใหม่ได้ทันที
export const playAgain = onCall(async (request) => {
  const uid = request.auth?.uid;
  assertAuthed(uid);

  const roomId: string = request.data?.roomId;
  if (!roomId) throw new HttpsError("invalid-argument", "ต้องระบุ roomId");

  const room = await getRoomOrThrow(roomId);
  assertIsHost(room, uid);

  // ล้างของลับของรอบที่แล้วทั้งหมด: เคลียร์ players/{uid}/isSpy|isJoker|role
  // (เผื่อมี residue จากรอบก่อน/ข้อมูลเดิม) + ลบ roomPrivate/{roomId} ทั้งก้อน
  const updates: Record<string, unknown> = {};
  Object.keys(room.players || {}).forEach((playerUid) => {
    updates[`rooms/${roomId}/players/${playerUid}/isSpy`] = null;
    updates[`rooms/${roomId}/players/${playerUid}/isJoker`] = null;
    updates[`rooms/${roomId}/players/${playerUid}/role`] = null;
  });

  const db = admin.database();
  await db.ref().update({
    ...updates,
    [`rooms/${roomId}/status`]: "lobby",
    [`rooms/${roomId}/round`]: null,
    [`rooms/${roomId}/votes`]: null,
    [`rooms/${roomId}/result`]: null,
    [`roomPrivate/${roomId}`]: null,
  });

  return { ok: true };
});
