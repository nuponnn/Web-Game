import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ServerValue } from "firebase-admin/database";
import { assertIsAdmin } from "../lib/admin";
import { cleanAndValidateLocation } from "../lib/locations";

// เพิ่ม location ใหม่ (ต้องเป็น admin เท่านั้น)
// - validate name/roles ฝั่ง server ไม่เชื่อ client
// - เขียนเป็น active: true ตั้งแต่แรก
export const addLocation = onCall(async (request) => {
  const uid = await assertIsAdmin(request.auth?.uid);

  const input = request.data as { name?: unknown; roles?: unknown };
  const { name, roles } = cleanAndValidateLocation({
    name: input?.name,
    roles: input?.roles,
  });

  const db = admin.database();

  // ห้ามชื่อซ้ำกับ location ที่มีอยู่แล้ว (เช็คผ่าน rules ที่ index ชื่อ)
  const existingSnap = await db
    .ref("locations")
    .orderByChild("name")
    .equalTo(name)
    .once("value");
  if (existingSnap.exists()) {
    throw new HttpsError("already-exists", "มีสถานที่ชื่อนี้อยู่แล้ว");
  }

  const newRef = db.ref("locations").push();
  await newRef.set({
    name,
    roles,
    active: true,
    createdAt: ServerValue.TIMESTAMP,
    createdBy: uid,
  });

  return { ok: true, locationId: newRef.key };
});
