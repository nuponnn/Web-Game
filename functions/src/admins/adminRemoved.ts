import * as admin from "firebase-admin";
import { onValueDeleted } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";

// ลบ user ออกจาก Firebase Auth แบบอัตโนมัติ เมื่อ record admin ที่ admins/{uid} หายไป
// (ใคร "หลุด" จาก admin ไม่ว่าจะผ่าน removeAdmin หรือ record ถูกลบทิ้งด้วยวิธีใด
//  user ใน auth จะถูกลบตามไปอัตโนมัติ ไม่ต้องลบมือ)
export const adminRemoved = onValueDeleted("admins/{uid}", async (event) => {
  const uid = event.params.uid;

  try {
    await admin.auth().deleteUser(uid);
    logger.info(`Deleted auth user ${uid} (removed from admins)`);
  } catch (err) {
    // user หายจาก auth ไปแล้ว ถือว่าโอเค (record ใน rtdb ลบไปแล้ว)
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") throw err;
  }
});
