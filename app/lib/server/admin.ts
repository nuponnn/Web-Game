import { adminDb } from "./firebaseAdmin";
import { ApiError } from "./errors";

// ยืนยันว่า uid นี้เป็น admin จริง (มี record อยู่ที่ admins/{uid})
// admins/{uid} จัดการผ่าน callable function / Firebase Console โดยตรงเท่านั้น
// (rules ปิด write ฝั่ง client) ไม่อิง client-side check เพียงอย่างเดียว
export async function assertIsAdmin(uid: string | undefined): Promise<string> {
  if (!uid) {
    throw new ApiError("unauthenticated", "ต้อง login ก่อน");
  }

  const snap = await adminDb.ref(`admins/${uid}`).once("value");
  if (!snap.exists()) {
    throw new ApiError("permission-denied", "เฉพาะ admin เท่านั้นที่ทำ action นี้ได้");
  }

  return uid;
}
