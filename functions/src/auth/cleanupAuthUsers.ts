import { getAuth } from "firebase-admin/auth";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// ล้าง user ใน Firebase Auth ที่เป็น anonymous และเก่ากว่า cutoff
// โดยมากคือบัญชีผู้เล่นที่เข้ามาลองเล่นครั้งเดียวแล้วหายไป
async function cleanup(cutoffMs: number): Promise<number> {
  const auth = getAuth();
  const cutoff = Date.now() - cutoffMs;
  const uidsToDelete: string[] = [];
  let nextPageToken: string | undefined;

  do {
    const result = await auth.listUsers(1000, nextPageToken);
    for (const user of result.users) {
      // anonymous user จะไม่มี provider (ไม่มี email/google/etc.)
      const isAnonymous = user.providerData.length === 0;
      const createdAt = new Date(user.metadata.creationTime).getTime();
      if (isAnonymous && createdAt < cutoff) {
        uidsToDelete.push(user.uid);
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  // deleteUsers รับได้สูงสุด 1000 uid ต่อครั้ง
  for (let i = 0; i < uidsToDelete.length; i += 1000) {
    await auth.deleteUsers(uidsToDelete.slice(i, i + 1000));
  }

  logger.info(`cleanupAuthUsers: deleted ${uidsToDelete.length} anonymous users`);
  return uidsToDelete.length;
}

// Scheduled: รันทุก 24 ชม. (cutoff = 24 ชม.)
export const cleanupAuthUsers = onSchedule(
  { schedule: "every 24 hours", timeZone: "Asia/Bangkok" },
  async () => {
    const deleted = await cleanup(24 * 60 * 60 * 1000);
    logger.info(`cleanupAuthUsers scheduled: deleted ${deleted} users`);
  }
);

// HTTP trigger สำหรับทดสอบ: POST /cleanupAuthUsersTest?cutoffSeconds=10
// ใช้ยิงตรงจาก tasks emulator หรือ curl โดยไม่ต้องรอ 24 ชม.
export const cleanupAuthUsersTest = onRequest(async (req, res) => {
  const cutoffSeconds = Number(req.query.cutoffSeconds) || 10;
  const cutoffMs = cutoffSeconds * 1000;
  logger.info(`cleanupAuthUsersTest: running with cutoff = ${cutoffSeconds}s`);

  const deleted = await cleanup(cutoffMs);

  res.json({ ok: true, deleted, cutoffSeconds });
});
