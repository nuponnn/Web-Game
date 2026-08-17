import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsPlayer,
  assertAuthed,
} from "../lib/roomState";

const DEFAULT_VOTE_DURATION_MS = 30 * 1000; // default 30 วินาที ถ้า host ไม่ได้กำหนด

export const endRound = onCall(async (request) => {
  const uid = request.auth?.uid;
  assertAuthed(uid);

  const roomId: string = request.data?.roomId;
  const reason: "timeout" | "host_ended" = request.data?.reason ?? "timeout";
  if (!roomId) throw new HttpsError("invalid-argument", "ต้องระบุ roomId");

  const room = await getRoomOrThrow(roomId);
  assertStatus(room, "playing");
  assertIsPlayer(room, uid);

  if (reason === "host_ended") {
    if (room.hostUid !== uid) {
      throw new HttpsError("permission-denied", "เฉพาะ host กดจบก่อนเวลาได้");
    }
  } else {
    // reason === "timeout": ไม่เชื่อ client เฉยๆ ต้องเช็คเวลาจริงฝั่ง server ก่อน
    const serverNow = Date.now(); // เวลา server ในสภาพแวดล้อม Cloud Functions เชื่อถือได้อยู่แล้ว
    const endsAt = room.round?.endsAt ?? 0;
    if (serverNow < endsAt) {
      throw new HttpsError(
        "failed-precondition",
        "ยังไม่หมดเวลา ไม่สามารถจบรอบได้"
      );
    }
  }

  // ระยะเวลาโหวต (ms): ใช้ค่าที่ host ตั้งไว้ในห้อง หรือ default 30 วินาที
  // จำกัดช่วง 10-120 วินาที กันตั้งค่าผิดพลาด
  const MIN_VOTE_MS = 10 * 1000;   // 10 วินาที
  const MAX_VOTE_MS = 120 * 1000;  // 2 นาที
  const voteDurationMs = Math.max(MIN_VOTE_MS, Math.min(MAX_VOTE_MS, room.voteDuration ?? DEFAULT_VOTE_DURATION_MS));

  const voteEndsAt = Date.now() + voteDurationMs;

  await admin.database().ref(`rooms/${roomId}`).update({
    "status": "voting",
    "round/voteEndsAt": voteEndsAt,
  });

  return { ok: true, voteEndsAt };
});
