import { NextRequest } from "next/server";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { ApiError } from "@/app/lib/server/errors";

const MAX_ROOM_AGE_MS = 6 * 60 * 60 * 1000; // 6 ชั่วโมง
const ALL_OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 นาที

function assertCronSecret(req: NextRequest) {
  const secret = req.headers.get("X-CRON-SECRET");
  if (!secret || secret !== process.env.CRON_SECRET) {
    throw new ApiError("permission-denied", "Invalid cron secret");
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCronSecret(req);

    const db = adminDb;
    const now = Date.now();

    const roomsSnap = await db.ref("rooms").once("value");
    const rooms = roomsSnap.val() as
      | Record<
          string,
          {
            createdAt?: number;
            players?: Record<string, { online?: boolean; lastOfflineAt?: number }>;
          }
        >
      | null;

    const validRoomIds = new Set<string>();
    let deleted = 0;

    for (const [roomId, room] of Object.entries(rooms || {})) {
      const createdAt = room?.createdAt;

      // ลบห้องเก่าเกิน 6 ชม. (กันห้องผีที่ไม่มีใครมา cleanup)
      if (!createdAt || now - createdAt > MAX_ROOM_AGE_MS) {
        await db.ref(`rooms/${roomId}`).remove();
        deleted++;
        continue;
      }

      // Sweep: ห้องที่ทุกคน offline ต่อเนื่องนานเกิน threshold
      const players = room?.players || {};
      const playerIds = Object.keys(players);
      if (playerIds.length > 0) {
        const allOffline = playerIds.every((pid) => !players[pid]?.online);
        if (allOffline) {
          // ใช้เวลา "คนล่าสุดที่ offline" ไม่ใช่เวลาสร้างห้อง
          // (คนล่าสุด = max ของ lastOfflineAt เพราะห้องเพิ่งกลายเป็น all-offline ตอนนั้น)
          const lastOfflineTimestamps = playerIds
            .map((pid) => players[pid]?.lastOfflineAt)
            .filter((t): t is number => typeof t === "number");

          // ถ้าไม่มี timestamp เลย (ไม่เคยมี client เขียนค่านี้ เช่น ห้องเก่าก่อน migrate)
          // fallback ไปใช้ createdAt เหมือนเดิม
          const allOfflineSince =
            lastOfflineTimestamps.length > 0
              ? Math.max(...lastOfflineTimestamps)
              : createdAt;

          if (now - allOfflineSince > ALL_OFFLINE_THRESHOLD_MS) {
            await db.ref(`rooms/${roomId}`).remove();
            deleted++;
            continue;
          }
        }
      }

      validRoomIds.add(roomId);
    }

    // ล้าง presence ค้าง
    const presenceSnap = await db.ref("presence").once("value");
    const presence = presenceSnap.val() as Record<string, unknown> | null;
    for (const roomId of Object.keys(presence || {})) {
      if (!validRoomIds.has(roomId)) {
        await db.ref(`presence/${roomId}`).remove();
      }
    }

    // ล้าง roomPrivate ค้าง
    const privateSnap = await db.ref("roomPrivate").once("value");
    const privateRooms = privateSnap.val() as Record<string, unknown> | null;
    for (const roomId of Object.keys(privateRooms || {})) {
      if (!validRoomIds.has(roomId)) {
        await db.ref(`roomPrivate/${roomId}`).remove();
      }
    }

    return Response.json({ ok: true, deleted, validRooms: validRoomIds.size });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}