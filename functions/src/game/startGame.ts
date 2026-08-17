import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getRoomOrThrow, assertStatus, assertIsHost, assertAuthed } from "../lib/roomState";
import { assignRoles } from "../lib/locations";
import { ServerValue } from "firebase-admin/database";
import { MIN_PLAYERS } from "../lib/constants";

const DEFAULT_ROUND_DURATION_MS = 8 * 60 * 1000; // default 8 นาที ถ้า host ไม่ได้กำหนด

export const startGame = onCall(async (request) => {
  const uid = request.auth?.uid;
  assertAuthed(uid);

  const roomId: string = request.data?.roomId;
  if (!roomId) throw new HttpsError("invalid-argument", "ต้องระบุ roomId");

  const room = await getRoomOrThrow(roomId);
  assertStatus(room, "lobby");
  assertIsHost(room, uid);

  const playerIds = Object.keys(room.players || {});
  if (playerIds.length < MIN_PLAYERS) {
    throw new HttpsError("failed-precondition", `ต้องมีผู้เล่นอย่างน้อย ${MIN_PLAYERS} คน`);
  }

  // 1. สุ่มสถานที่ - อ่านจาก database (locations/{id} ที่ active === true)
  //    ไม่ได้ใช้ static file ในโค้ดแล้ว admin เพิ่ม/แก้/ปิดผ่านหน้าเว็บได้เลย
  const locationsSnap = await admin
    .database()
    .ref("locations")
    .orderByChild("active")
    .equalTo(true)
    .once("value");

  const locationsVal = locationsSnap.val() as
    | Record<string, { name: string; roles: string[] }>
    | null;

  const activeLocations = Object.entries(locationsVal || {}).map(([id, loc]) => ({
    id,
    name: loc.name,
    roles: loc.roles,
  }));

  // กันเกม start ไม่ได้แบบเงียบๆ ถ้า admin ยังไม่ได้เพิ่ม/เปิด location ไว้เลย
  if (activeLocations.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "ยังไม่มีสถานที่ที่เปิดใช้งานอยู่ในระบบ กรุณาให้ admin เพิ่ม location ก่อน"
    );
  }

  // ใช้ location ที่ host เลือก (จากหน้า Lobby หรือตอนสร้างห้อง) ต้องเป็นตัวที่ active จริง
  // ถ้าไม่เลือกเลย -> สุ่ม
  const requestedLocationId =
    typeof request.data?.locationId === "string" && request.data.locationId.length > 0 ?
      request.data.locationId :
      room.selectedLocationId;

  let location: (typeof activeLocations)[number];
  if (requestedLocationId) {
    const chosen = activeLocations.find((l) => l.id === requestedLocationId);
    if (!chosen) {
      throw new HttpsError(
        "invalid-argument",
        "location ที่เลือกไม่มีอยู่หรือถูกปิดการใช้งานแล้ว"
      );
    }
    location = chosen;
  } else {
    location = activeLocations[Math.floor(Math.random() * activeLocations.length)];
  }

  // จำนวน spy: จากที่ host ส่งตอน start -> ค่าที่ตั้งไว้ตอนสร้างห้อง -> default 1
  const requestedSpyCount =
    typeof request.data?.spyCount === "number" && Number.isInteger(request.data.spyCount) ?
      request.data.spyCount :
      room.spyCount ?? 1;

  if (requestedSpyCount < 1 || requestedSpyCount >= playerIds.length) {
    throw new HttpsError(
      "invalid-argument",
      `จำนวน spy ต้องอยู่ระหว่าง 1 ถึง ${playerIds.length - 1} (ต้องเหลือคนปกติอย่างน้อย 1 คน)`
    );
  }

  // ระยะเวลาหา spy (ms): จากที่ host ส่งตอน start -> ค่าที่ตั้งไว้ตอนสร้างห้อง -> default 8 นาที
  // จำกัดช่วง 1-15 นาที กันตั้งค่าผิดพลาด
  const MIN_ROUND_MS = 60 * 1000;      // 1 นาที
  const MAX_ROUND_MS = 15 * 60 * 1000; // 15 นาที
  const requestedRoundDuration =
    typeof request.data?.roundDuration === "number" && Number.isFinite(request.data.roundDuration)
      ? request.data.roundDuration
      : room.roundDuration ?? DEFAULT_ROUND_DURATION_MS;
  const roundDurationMs = Math.max(MIN_ROUND_MS, Math.min(MAX_ROUND_MS, requestedRoundDuration));

  // ระยะเวลาโหวต (ms): จากที่ host ส่งตอน start -> ค่าที่ตั้งไว้ตอนสร้างห้อง -> default 30 วินาที
  const MIN_VOTE_MS = 10 * 1000;   // 10 วินาที
  const MAX_VOTE_MS = 120 * 1000;  // 2 นาที
  const DEFAULT_VOTE_DURATION_MS = 30 * 1000;
  const requestedVoteDuration =
    typeof request.data?.voteDuration === "number" && Number.isFinite(request.data.voteDuration)
      ? request.data.voteDuration
      : room.voteDuration ?? DEFAULT_VOTE_DURATION_MS;
  const voteDurationMs = Math.max(MIN_VOTE_MS, Math.min(MAX_VOTE_MS, requestedVoteDuration));

  // 2. สุ่ม spy ตามจำนวนที่กำหนด (ไม่ซ้ำกัน)
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const spyUids = shuffled.slice(0, requestedSpyCount);
  const spySet = new Set(spyUids);
  const nonSpyIds = playerIds.filter((id) => !spySet.has(id));

  // 3. แจก role ให้คนที่ไม่ใช่สปาย
  const roles = assignRoles(location, nonSpyIds.length);

  // 4. เตรียม multi-path update เขียนทีเดียวให้ atomic
  const updates: Record<string, unknown> = {};
  playerIds.forEach((id) => {
    const isSpy = spySet.has(id);
    updates[`players/${id}/isSpy`] = isSpy;
    updates[`players/${id}/role`] = isSpy ? "spy" : null; // เดี๋ยวเติมด้านล่าง
  });
  nonSpyIds.forEach((id, i) => {
    updates[`players/${id}/role`] = roles[i];
  });

  updates["location"] = location.name;
  updates["locationId"] = location.id; // เก็บ id เผื่อ audit / กันแก้ location ที่กำลังใช้อยู่
  updates["status"] = "playing";
  updates["votes"] = null; // เคลียร์ของรอบก่อนหน้า (กันกรณีเล่นซ้ำ)
  updates["result"] = null;

  // สำคัญ: ใช้ ServerValue.TIMESTAMP เพื่อให้ endsAt คำนวณจากเวลา server จริง
  // ต้องเขียน 2 ครั้ง เพราะ ServerValue.TIMESTAMP resolve ตอน commit เท่านั้น
  // เราจึงต้อง set startedAt ก่อน แล้วค่อยคำนวณ endsAt จากค่าที่ resolve แล้วในขั้นถัดไป
  updates["round/duration"] = roundDurationMs;
  updates["round/startedAt"] = ServerValue.TIMESTAMP;

  // เก็บค่า roundDuration ที่ใช้จริงไว้ในห้อง เพื่อให้รอบถัดไป (playAgain) ใช้ค่าเดิมได้
  updates["roundDuration"] = roundDurationMs;
  updates["voteDuration"] = voteDurationMs;

  await admin.database().ref(`rooms/${roomId}`).update(updates);

  // อ่านค่า startedAt ที่ server resolve แล้วกลับมา เพื่อคำนวณ endsAt ที่แม่นยำ
  const startedAtSnap = await admin
    .database()
    .ref(`rooms/${roomId}/round/startedAt`)
    .once("value");
  const startedAt = startedAtSnap.val() as number;
  const endsAt = startedAt + roundDurationMs;

  await admin.database().ref(`rooms/${roomId}/round/endsAt`).set(endsAt);

  return { ok: true, endsAt, spyCount: spyUids.length, roundDuration: roundDurationMs, voteDuration: voteDurationMs };
});
