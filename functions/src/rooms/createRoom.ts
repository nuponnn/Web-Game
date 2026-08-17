import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assertAuthed } from "../lib/roomState";
import { assertIsAdmin } from "../lib/admin";
import { MAX_PLAYERS } from "../lib/constants";
import { ServerValue } from "firebase-admin/database";

const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ตัดตัวที่งง เช่น O,I,0,1 ออก

function generateRoomId(length = 4): string {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return id;
}

export const createRoom = onCall(async (request) => {
  const uid = request.auth?.uid;
  assertAuthed(uid);

  const name: string = request.data?.name?.trim();
  if (!name || name.length > 20) {
    throw new HttpsError("invalid-argument", "ต้องระบุชื่อผู้เล่น (ไม่เกิน 20 ตัวอักษร)");
  }

  // มีเฉพาะ admin เท่านั้นที่เลือก location / กำหนดจำนวน spy ตอนสร้างห้องได้
  // (ใคร login ด้วย Google ที่ /admin ก็สมัครเป็น admin ได้เองอยู่แล้ว)
  const requestedLocationId =
    typeof request.data?.locationId === "string" && request.data.locationId.length > 0 ?
      request.data.locationId :
      undefined;
  const requestedSpyCount =
    typeof request.data?.spyCount === "number" && Number.isInteger(request.data.spyCount) ?
      request.data.spyCount :
      undefined;

  // จำนวน joker (0-5) - host ทุกคนกำหนดได้
  const MAX_JOKER_COUNT = 5;
  const requestedJokerCount =
    typeof request.data?.jokerCount === "number" && Number.isInteger(request.data.jokerCount) ?
      Math.max(0, Math.min(MAX_JOKER_COUNT, request.data.jokerCount)) :
      undefined;

  // เวลาหา spy (ms) - host ทุกคนกำหนดได้ จำกัด 1-15 นาที
  const MIN_ROUND_MS = 60 * 1000;
  const MAX_ROUND_MS = 15 * 60 * 1000;
  const requestedRoundDuration =
    typeof request.data?.roundDuration === "number" &&
    Number.isFinite(request.data.roundDuration) ?
      Math.max(MIN_ROUND_MS, Math.min(MAX_ROUND_MS, request.data.roundDuration)) :
      undefined;

  // เวลาโหวต (ms) - host ทุกคนกำหนดได้ จำกัด 10-120 วินาที
  const MIN_VOTE_MS = 10 * 1000;
  const MAX_VOTE_MS = 120 * 1000;
  const requestedVoteDuration =
    typeof request.data?.voteDuration === "number" &&
    Number.isFinite(request.data.voteDuration) ?
      Math.max(MIN_VOTE_MS, Math.min(MAX_VOTE_MS, request.data.voteDuration)) :
      undefined;

  let selectedLocationId: string | undefined;
  let spyCount: number | undefined;
  let jokerCount: number | undefined;

  if (requestedLocationId || requestedSpyCount !== undefined) {
    await assertIsAdmin(uid);
  }

  const db = admin.database();

  // ตรวจ location ที่เลือก (ต้องเป็นตัวที่ active จริง)
  if (requestedLocationId) {
    const locSnap = await db.ref(`locations/${requestedLocationId}`).once("value");
    const loc = locSnap.val() as { active?: boolean } | null;
    if (!loc || loc.active !== true) {
      throw new HttpsError("invalid-argument", "location ที่เลือกไม่มีอยู่หรือถูกปิดการใช้งาน");
    }
    selectedLocationId = requestedLocationId;
  }

  // จำนวน spy ต้องเป็นเลข 1..MAX_PLAYERS-1 (ต้องเหลือคนปกติอย่างน้อย 1 คน)
  if (requestedSpyCount !== undefined) {
    if (requestedSpyCount < 1 || requestedSpyCount > MAX_PLAYERS - 1) {
      throw new HttpsError(
        "invalid-argument",
        `จำนวน spy ต้องอยู่ระหว่าง 1 ถึง ${MAX_PLAYERS - 1}`
      );
    }
    spyCount = requestedSpyCount;
  }

  // จำนวน joker (0-5) - ไม่ต้องเช็ค admin เพราะ host ทุกคนกำหนดได้
  if (requestedJokerCount !== undefined) {
    jokerCount = requestedJokerCount;
  }

  // สุ่ม roomId แล้วเช็คชนก่อน ลองใหม่ถ้าซ้ำ (โอกาสชนน้อยมากแต่กันไว้)
  let roomId = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateRoomId();
    const existing = await db.ref(`rooms/${candidate}`).once("value");
    if (!existing.exists()) {
      roomId = candidate;
      break;
    }
  }
  if (!roomId) {
    throw new HttpsError("internal", "สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  await db.ref(`rooms/${roomId}`).set({
    hostUid: uid,
    status: "lobby",
    createdAt: ServerValue.TIMESTAMP,
    ...(selectedLocationId ? { selectedLocationId } : {}),
    ...(spyCount !== undefined ? { spyCount } : {}),
    ...(jokerCount !== undefined ? { jokerCount } : {}),
    ...(requestedRoundDuration !== undefined ? { roundDuration: requestedRoundDuration } : {}),
    ...(requestedVoteDuration !== undefined ? { voteDuration: requestedVoteDuration } : {}),
    players: {
      [uid]: {
        name,
        online: true,
        joinedAt: ServerValue.TIMESTAMP,
      },
    },
  });

  return { roomId };
});
