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

  // จำนวน joker: จากที่ host ส่งตอน start -> ค่าที่ตั้งไว้ตอนสร้างห้อง -> default 0
  const MAX_JOKER_COUNT = 5;
  const requestedJokerCount =
    typeof request.data?.jokerCount === "number" && Number.isInteger(request.data.jokerCount) ?
      Math.max(0, Math.min(MAX_JOKER_COUNT, request.data.jokerCount)) :
      room.jokerCount ?? 0;

  // ตรวจสอบว่า spy + joker < จำนวนผู้เล่น (ต้องเหลือคนปกติอย่างน้อย 1 คน)
  if (requestedSpyCount + requestedJokerCount >= playerIds.length) {
    const total = requestedSpyCount + requestedJokerCount;
    throw new HttpsError(
      "invalid-argument",
      `spy + joker = ${total} ต้องน้อยกว่าผู้เล่น ${playerIds.length} คน`
    );
  }

  // ระยะเวลาหา spy (ms): จากที่ host ส่งตอน start -> ค่าที่ตั้งไว้ตอนสร้างห้อง -> default 8 นาที
  // จำกัดช่วง 1-15 นาที กันตั้งค่าผิดพลาด
  const MIN_ROUND_MS = 60 * 1000; // 1 นาที
  const MAX_ROUND_MS = 15 * 60 * 1000; // 15 นาที
  const requestedRoundDuration =
    typeof request.data?.roundDuration === "number" &&
    Number.isFinite(request.data.roundDuration) ?
      request.data.roundDuration :
      room.roundDuration ?? DEFAULT_ROUND_DURATION_MS;
  const roundDurationMs = Math.max(
    MIN_ROUND_MS,
    Math.min(MAX_ROUND_MS, requestedRoundDuration)
  );

  // ระยะเวลาโหวต (ms): จากที่ host ส่งตอน start -> ค่าที่ตั้งไว้ตอนสร้างห้อง -> default 30 วินาที
  const MIN_VOTE_MS = 10 * 1000; // 10 วินาที
  const MAX_VOTE_MS = 120 * 1000; // 2 นาที
  const DEFAULT_VOTE_DURATION_MS = 30 * 1000;
  const requestedVoteDuration =
    typeof request.data?.voteDuration === "number" &&
    Number.isFinite(request.data.voteDuration) ?
      request.data.voteDuration :
      room.voteDuration ?? DEFAULT_VOTE_DURATION_MS;
  const voteDurationMs = Math.max(
    MIN_VOTE_MS,
    Math.min(MAX_VOTE_MS, requestedVoteDuration)
  );

  // 2. สุ่ม spy ตามจำนวนที่กำหนด (ไม่ซ้ำกัน)
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const spyUids = shuffled.slice(0, requestedSpyCount);
  const spySet = new Set(spyUids);
  const nonSpyIds = playerIds.filter((id) => !spySet.has(id));

  // 3. สุ่ม joker จากผู้เล่นที่ไม่ใช่ spy (ไม่ซ้ำกัน)
  const shuffledNonSpy = [...nonSpyIds].sort(() => Math.random() - 0.5);
  const jokerUids = shuffledNonSpy.slice(0, requestedJokerCount);
  const jokerSet = new Set(jokerUids);
  const nonSpyNonJokerIds = nonSpyIds.filter((id) => !jokerSet.has(id));

  // 4. แจก role ให้คนที่ไม่ใช่ spy และไม่ใช่ joker
  const roles = assignRoles(location, nonSpyNonJokerIds.length);
  const roleByUid: Record<string, string> = {};
  nonSpyNonJokerIds.forEach((id, i) => {
    roleByUid[id] = roles[i];
  });

  // 5. เตรียม multi-path update เขียนทีเดียวให้ atomic (เขียนจาก root ต้องใส่ path เต็ม)
  //    ข้อมูลลับ (location/role/isSpy/isJoker) เขียนไปที่ roomPrivate/{roomId}/{uid}
  //    เพราะ rule ของ rooms/{roomId} เปิดอ่านทุกคน และ rules cascade ทำให้ child rule
  //    กันข้อมูลลับไม่ได้ (child ไม่อาจ revoke สิทธิ์ที่ parent ให้) ต้องแยก path ต่างหาก
  const updates: Record<string, unknown> = {};
  const privateUpdates: Record<string, unknown> = {};
  playerIds.forEach((id) => {
    const isSpy = spySet.has(id);
    const isJoker = jokerSet.has(id);
    const isNormal = !isSpy && !isJoker;
    privateUpdates[`roomPrivate/${roomId}/${id}`] = {
      isSpy,
      isJoker,
      // spy ไม่ได้รู้ location; ผู้เล่นปกติได้ location + role (joker ได้แค่ location)
      ...(isNormal ? { role: roleByUid[id], location: location.name } : isJoker ? { location: location.name } : {}),
    };
    // เคลียร์ secret fields เก่าที่เคยเขียนไว้ใต้ players (ข้อมูลรอบก่อน/ข้อมูลเดิม) กันรั่ว
    updates[`rooms/${roomId}/players/${id}/isSpy`] = null;
    updates[`rooms/${roomId}/players/${id}/isJoker`] = null;
    updates[`rooms/${roomId}/players/${id}/role`] = null;
  });

  // location (ชื่อ) ไม่เขียนใน public room ระหว่างเล่น — จะถูกเขียนตอน reveal (ดู castVote.ts)
  // เพื่อให้ spy เห็นสถานที่ตอนจบเกม แต่เห็นไม่ได้ระหว่างเล่น
  updates[`rooms/${roomId}/location`] = null;
  updates[`rooms/${roomId}/locationId`] = location.id; // เก็บ id เผื่อ audit / กันแก้ location ที่กำลังใช้อยู่
  updates[`rooms/${roomId}/status`] = "playing";
  updates[`rooms/${roomId}/votes`] = null; // เคลียร์ของรอบก่อนหน้า (กันกรณีเล่นซ้ำ)
  updates[`rooms/${roomId}/result`] = null;

  // สำคัญ: ใช้ ServerValue.TIMESTAMP เพื่อให้ endsAt คำนวณจากเวลา server จริง
  // ต้องเขียน 2 ครั้ง เพราะ ServerValue.TIMESTAMP resolve ตอน commit เท่านั้น
  // เราจึงต้อง set startedAt ก่อน แล้วค่อยคำนวณ endsAt จากค่าที่ resolve แล้วในขั้นถัดไป
  updates[`rooms/${roomId}/round/duration`] = roundDurationMs;
  updates[`rooms/${roomId}/round/startedAt`] = ServerValue.TIMESTAMP;

  // เก็บค่า roundDuration ที่ใช้จริงไว้ในห้อง เพื่อให้รอบถัดไป (playAgain) ใช้ค่าเดิมได้
  updates[`rooms/${roomId}/roundDuration`] = roundDurationMs;
  updates[`rooms/${roomId}/voteDuration`] = voteDurationMs;
  updates[`rooms/${roomId}/jokerCount`] = requestedJokerCount;

  // เขียน public room + private data ใน update เดียว (root) ให้ atomic
  await admin.database().ref().update({ ...updates, ...privateUpdates });

  // อ่านค่า startedAt ที่ server resolve แล้วกลับมา เพื่อคำนวณ endsAt ที่แม่นยำ
  const startedAtSnap = await admin
    .database()
    .ref(`rooms/${roomId}/round/startedAt`)
    .once("value");
  const startedAt = startedAtSnap.val() as number;
  const endsAt = startedAt + roundDurationMs;

  await admin.database().ref(`rooms/${roomId}/round/endsAt`).set(endsAt);

  return {
    ok: true,
    endsAt,
    spyCount: spyUids.length,
    jokerCount: requestedJokerCount,
    roundDuration: roundDurationMs,
    voteDuration: voteDurationMs,
  };
});
