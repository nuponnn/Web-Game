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

  // ล้าง isSpy/role ของผู้เล่นทุกคน
  const playerUpdates: Record<string, unknown> = {};
  Object.keys(room.players || {}).forEach((playerUid) => {
    playerUpdates[`players/${playerUid}/isSpy`] = null;
    playerUpdates[`players/${playerUid}/role`] = null;
  });

  await admin.database().ref(`rooms/${roomId}`).update({
    status: "lobby",
    ...playerUpdates,
    round: null,
    votes: null,
    result: null,
  });

  return { ok: true };
});
