import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assertIsAdmin } from "../lib/admin";

// ลบ location แบบถาวร (ต้องเป็น admin เท่านั้น)
// ใช้เมื่อแน่ใจว่าไม่มีห้องไหนอ้างอิงอยู่แล้ว (กรณีปกติแนะนำให้ toggle ปิดก่อน)
export const deleteLocation = onCall(async (request) => {
  await assertIsAdmin(request.auth?.uid);

  const locationId: string = request.data?.locationId;
  if (!locationId) {
    throw new HttpsError("invalid-argument", "ต้องระบุ locationId");
  }

  const db = admin.database();
  const locationRef = db.ref(`locations/${locationId}`);

  const snap = await locationRef.once("value");
  if (!snap.exists()) {
    throw new HttpsError("not-found", "ไม่พบ location");
  }

  await locationRef.remove();
  return { ok: true };
});
