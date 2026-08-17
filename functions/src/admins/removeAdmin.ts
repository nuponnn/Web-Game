import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assertIsAdmin } from "../lib/admin";

// ถอดสิทธิ์ admin (ต้องเป็น admin เท่านั้น)
// ลบ record ที่ admins/{uid} ใน RTDB — user ใน Firebase Auth จะถูก
// trigger adminRemoved ลบให้อัตโนมัติ (ทำแบบ auto ไม่ต้องลบมือ)
export const removeAdmin = onCall(async (request) => {
  const callerUid = await assertIsAdmin(request.auth?.uid);

  const uid: string = request.data?.uid;
  if (!uid || typeof uid !== "string" || uid.length === 0) {
    throw new HttpsError("invalid-argument", "ต้องระบุ uid");
  }
  if (uid === callerUid) {
    throw new HttpsError("invalid-argument", "ลบตัวเองไม่ได้ (กัน lock out)");
  }

  const db = admin.database();
  const adminRef = db.ref(`admins/${uid}`);
  if (!(await adminRef.once("value")).exists()) {
    throw new HttpsError("not-found", "user นี้ไม่ใช่ admin");
  }

  await adminRef.remove();

  return { ok: true };
});
