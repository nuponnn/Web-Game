import * as admin from "firebase-admin";
import { onValueWritten } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";

interface Player {
  name?: string;
  online?: boolean;
}

// trigger ที่ path presence/{roomId}/{uid} ซึ่ง client เป็นคนเขียน
// (rules อนุญาตให้เขียนได้เฉพาะของตัวเอง + onDisconnect ลบออกอัตโนมัติ)
// หน้าที่:
//  - เชื่อมต่อ  -> set players/{uid}/online = true
//  - หลุด       -> host หลุด = ลบห้องทิ้งทันที
//                -> ผู้เล่นธรรมดาหลุด = set online = false และถ้าไม่มีใคร online
//                   เหลือเลยให้ลบห้องทิ้ง
export const presenceCleanup = onValueWritten(
  "presence/{roomId}/{uid}",
  async (event) => {
    const roomId = event.params.roomId;
    const uid = event.params.uid;
    const after = event.data.after;

    const db = admin.database();

    if (after.exists()) {
      // ผู้เล่นเพิ่งเชื่อมต่อกลับมา -> กลับมาเป็น online
      await db.ref(`rooms/${roomId}/players/${uid}/online`).set(true);
      return;
    }

    // onDisconnect ลบ presence ออกแล้ว = ผู้เล่นหลุดการเชื่อมต่อ
    const roomSnap = await db.ref(`rooms/${roomId}`).once("value");
    const room = roomSnap.val();
    if (!room) return; // ห้องถูกลบไปแล้ว ไม่ต้องทำอะไร

    // ถ้าผู้เล่นถูก host เตะออกจากห้องไปแล้ว (players/{uid} ถูกลบ)
    // ไม่ต้องเขียน online = false เพราะจะเป็นการสร้าง node ใหม่ขึ้นมา
    if (!room.players || !room.players[uid]) return;

    if (room.hostUid === uid) {
      // host หลุด -> ไม่มีใครบริหารห้องได้ โลบลบห้องทิ้งเลย
      await db.ref(`rooms/${roomId}`).remove();
      logger.info(`Deleted room ${roomId}: host ${uid} disconnected`);
      return;
    }

    await db.ref(`rooms/${roomId}/players/${uid}/online`).set(false);

    // เช็คว่ายังมีใครออนไลน์เหลือไหม ถ้าไม่มีเลย = ทิ้งห้องไว้ก็ไร้ประโยชน์
    const playersSnap = await db.ref(`rooms/${roomId}/players`).once("value");
    const players = playersSnap.val() as Record<string, Player> | null;
    const anyoneOnline = Object.values(players || {}).some(
      (p) => p.online === true
    );

    if (!anyoneOnline) {
      await db.ref(`rooms/${roomId}`).remove();
      logger.info(`Deleted room ${roomId}: no players online`);
    }
  }
);
