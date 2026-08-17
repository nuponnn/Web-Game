import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ServerValue } from "firebase-admin/database";
import { assertIsAdmin } from "../lib/admin";

// เพิ่ม admin ใหม่ (ต้องเป็น admin เท่านั้น)
// รับ uid ของคนที่จะให้สิทธิ์ - คนนั้นต้องเคย login (Google) ผ่าน Firebase มาแล้ว
// ถึงจะมี record ใน Firebase Auth ให้ดึง email/displayName มาบันทึกไว้ได้
export const addAdmin = onCall(async (request) => {
  const callerUid = await assertIsAdmin(request.auth?.uid);

  const uid: string = request.data?.uid;
  if (!uid || typeof uid !== "string" || uid.length === 0) {
    throw new HttpsError("invalid-argument", "ต้องระบุ uid ของคนที่จะให้เป็น admin");
  }
  if (uid === callerUid) {
    throw new HttpsError("invalid-argument", "คุณเป็น admin อยู่แล้ว");
  }

  // ตรวจว่า user มีอยู่จริงใน Auth + ดึงข้อมูลมาเก็บ (กันใส่ uid มั่วๆ)
  let userRecord;
  try {
    userRecord = await admin.auth().getUser(uid);
  } catch {
    throw new HttpsError(
      "not-found",
      "ไม่พบ user นี้ใน Firebase Auth (ต้องให้คนนั้นลอง login ผ่าน Google มาอย่างน้อย 1 ครั้งก่อน)"
    );
  }

  const db = admin.database();
  const adminRef = db.ref(`admins/${uid}`);
  if ((await adminRef.once("value")).exists()) {
    throw new HttpsError("already-exists", "user นี้เป็น admin อยู่แล้ว");
  }

  await adminRef.set({
    email: userRecord.email ?? null,
    displayName: userRecord.displayName ?? null,
    addedAt: ServerValue.TIMESTAMP,
    addedBy: callerUid,
  });

  return { ok: true };
});
