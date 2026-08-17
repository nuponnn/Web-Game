import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ServerValue } from "firebase-admin/database";
import { assertIsAdmin } from "../lib/admin";

// เปิด/ปิดการใช้งาน location (ต้องเป็น admin เท่านั้น)
// ใช้ toggle (active: false) แทนการลบจริง เพราะกันกรณีห้องที่กำลังเล่นอยู่
// อ้างอิง location ที่ถูกลบไปแล้ว -> จะ error ตอนแสดงผล
export const toggleLocationActive = onCall(async (request) => {
  await assertIsAdmin(request.auth?.uid);

  const locationId: string = request.data?.locationId;
  if (!locationId) {
    throw new HttpsError("invalid-argument", "ต้องระบุ locationId");
  }

  const db = admin.database();
  const locationSnap = await db.ref(`locations/${locationId}`).once("value");
  const location = locationSnap.val();
  if (!location) {
    throw new HttpsError("not-found", "ไม่พบ location");
  }

  const nextActive = !(location.active === true);
  await db.ref(`locations/${locationId}`).update({
    active: nextActive,
    updatedAt: ServerValue.TIMESTAMP,
  });

  return { ok: true, active: nextActive };
});
