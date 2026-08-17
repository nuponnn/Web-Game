import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ServerValue } from "firebase-admin/database";
import { assertIsAdmin } from "../lib/admin";
import { cleanAndValidateLocation } from "../lib/locations";

// แก้ไข location ที่มีอยู่ (ต้องเป็น admin เท่านั้น)
// validate เหมือนตอน add และเช็คชื่อซ้ำ (เว้นตัวมันเอง)
export const updateLocation = onCall(async (request) => {
  const uid = await assertIsAdmin(request.auth?.uid);

  const locationId: string = request.data?.locationId;
  if (!locationId) {
    throw new HttpsError("invalid-argument", "ต้องระบุ locationId");
  }

  const { name, roles } = cleanAndValidateLocation({
    name: request.data?.name,
    roles: request.data?.roles,
  });

  const db = admin.database();

  const locationSnap = await db.ref(`locations/${locationId}`).once("value");
  if (!locationSnap.exists()) {
    throw new HttpsError("not-found", "ไม่พบ location");
  }

  // ห้ามชื่อซ้ำกับ location อื่น (ตัวมันเองเปลี่ยนชื่อได้)
  const existingSnap = await db
    .ref("locations")
    .orderByChild("name")
    .equalTo(name)
    .once("value");
  const existing = existingSnap.val() as Record<string, unknown> | null;
  for (const id of Object.keys(existing || {})) {
    if (id !== locationId) {
      throw new HttpsError("already-exists", "มีสถานที่ชื่อนี้อยู่แล้ว");
    }
  }

  await db.ref(`locations/${locationId}`).update({
    name,
    roles,
    updatedAt: ServerValue.TIMESTAMP,
    updatedBy: uid,
  });

  return { ok: true };
});
