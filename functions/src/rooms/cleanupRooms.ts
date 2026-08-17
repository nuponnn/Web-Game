import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";

// ลบห้อง/ไอดีที่ค้างเกินเวลากำหนด (หลุด/ถูกทิ้งไว้นานเกินไป) ทิ้ง
// กำหนดไว้ 6 ชั่วโมง: ห้องที่สร้างมาเกิน 6 ชม. ยังไม่จบเกม/ไม่มีใครทำอะไร
// ถือว่าถูกทิ้งไปแล้ว -> cleanupRooms จะลบออกพร้อมล้าง presence ค้าง
const MAX_ROOM_AGE_MS = 6 * 60 * 60 * 1000; // 6 ชั่วโมง

// กันห้องที่ค้างอยู่ไม่มีวันถูกลบ (เช่น host ปิด tab กลางคันก่อนจบเกม)
// วิ่งทุก 6 ชั่วโมง ลบห้องที่สร้างมานานกว่า 6 ชม. ทิ้ง
// พร้อมล้าง presence ค้างของห้องที่ไม่มีอยู่แล้ว
export const cleanupRooms = onSchedule(
  { schedule: "every 6 hours", timeZone: "Asia/Bangkok" },
  async () => {
    const db = admin.database();
    const now = Date.now();

    const roomsSnap = await db.ref("rooms").once("value");
    const rooms = roomsSnap.val() as
      | Record<string, { createdAt?: number }>
      | null;

    const validRoomIds = new Set<string>();
    let deleted = 0;

    for (const [roomId, room] of Object.entries(rooms || {})) {
      const createdAt = room?.createdAt;
      if (!createdAt || now - createdAt > MAX_ROOM_AGE_MS) {
        await db.ref(`rooms/${roomId}`).remove();
        deleted++;
      } else {
        validRoomIds.add(roomId);
      }
    }

    // ล้าง presence ค้างของห้องที่โดนลบ/ไม่มีอยู่แล้ว
    const presenceSnap = await db.ref("presence").once("value");
    const presence = presenceSnap.val() as Record<string, unknown> | null;
    for (const roomId of Object.keys(presence || {})) {
      if (!validRoomIds.has(roomId)) {
        await db.ref(`presence/${roomId}`).remove();
      }
    }

    // ล้าง roomPrivate ค้างของห้องที่โดนลบ (ข้อมูลลับของผู้เล่นไม่ควรค้างอยู่)
    const privateSnap = await db.ref("roomPrivate").once("value");
    const privateRooms = privateSnap.val() as Record<string, unknown> | null;
    for (const roomId of Object.keys(privateRooms || {})) {
      if (!validRoomIds.has(roomId)) {
        await db.ref(`roomPrivate/${roomId}`).remove();
      }
    }

    logger.info(`cleanupRooms: deleted ${deleted} stale rooms`);
  }
);
