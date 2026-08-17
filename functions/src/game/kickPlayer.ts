import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsHost,
  assertAuthed,
} from "../lib/roomState";

// host เตะผู้เล่นออกจากห้อง (ได้เฉพาะตอน lobby เท่านั้น)
export const kickPlayer = onCall(async (request) => {
  const uid = request.auth?.uid;
  assertAuthed(uid);

  const roomId: string = request.data?.roomId;
  const targetUid: string = request.data?.targetUid;
  if (!roomId || !targetUid) {
    throw new HttpsError("invalid-argument", "ต้องระบุ roomId และ targetUid");
  }

  const room = await getRoomOrThrow(roomId);
  assertStatus(room, "lobby");
  assertIsHost(room, uid);

  // ห้ามเตะตัวเอง
  if (targetUid === uid) {
    throw new HttpsError("failed-precondition", "เตะตัวเองไม่ได้");
  }

  // เช็คว่าผู้เล่นที่จะเตะอยู่ในห้องจริง
  if (!room.players || !room.players[targetUid]) {
    throw new HttpsError("not-found", "ไม่พบผู้เล่นนี้ในห้อง");
  }

  // ลบผู้เล่นออกจาก players + ลบ presence ด้วย (กันค้าง)
  // + ลบ roomPrivate ของคนนั้น (ข้อมูลลับของเขาไม่ควรค้างอยู่)
  // สำคัญ: db.ref().update() เขียนจาก root ต้องใส่ path เต็ม
  const db = admin.database();
  const updates: Record<string, unknown> = {};
  updates[`rooms/${roomId}/players/${targetUid}`] = null;
  updates[`presence/${roomId}/${targetUid}`] = null;
  updates[`roomPrivate/${roomId}/${targetUid}`] = null;

  await db.ref().update(updates);

  return { ok: true, kickedName: room.players[targetUid].name };
});
