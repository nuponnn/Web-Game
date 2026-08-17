/**
 * Test script สำหรับ cleanupAuthUsers
 * รันหลังจาก firebase emulators:start แล้ว
 *
 * วิธีใช้:
 *   node scripts/testCleanupAuth.js
 *
 * Flow:
 *   1. สร้าง anonymous user ใหม่ใน Auth emulator
 *   2. รอ 10 วินาที
 *   3. รัน cleanup logic (cutoff = 10 วินาที)
 *   4. ตรวจสอบว่า user ถูกลบแล้ว
 */

const admin = require("firebase-admin");

// เชื่อมต่อ Auth emulator โดยตรง
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";

admin.initializeApp({ projectId: "demo-spyfall" });

const auth = admin.auth();

const WAIT_SECONDS = 10;
const CUTOFF_MS = WAIT_SECONDS * 1000;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== cleanupAuthUsers Test ===\n");

  // 1. สร้าง anonymous user
  console.log("1) สร้าง anonymous user ใหม่...");
  const userRecord = await auth.createUser({
    displayName: "test-anonymous-" + Date.now(),
  });
  // จำลอง anonymous user: ไม่มี provider data
  // (Auth emulator ไม่บังคับ providerData ตอน createUser จริงๆ)
  const uid = userRecord.uid;
  console.log(`   สร้าง user: ${uid}`);
  console.log(`   สร้างเมื่อ: ${new Date().toISOString()}`);

  // 2. รอ 10 วินาที
  console.log(`\n2) รอ ${WAIT_SECONDS} วินาที...`);
  for (let i = WAIT_SECONDS; i > 0; i--) {
    process.stdout.write(`   ${i}... `);
    await sleep(1000);
  }
  console.log("\n   หมดเวลารอ!");

  // 3. รัน cleanup logic (cutoff = 10 วินาที)
  console.log("\n3) รัน cleanup logic (cutoff = 10 วินาที)...");
  const cutoff = Date.now() - CUTOFF_MS;
  const uidsToDelete = [];
  let nextPageToken;

  do {
    const result = await auth.listUsers(1000, nextPageToken);
    for (const user of result.users) {
      const isAnonymous = user.providerData.length === 0;
      const createdAt = new Date(user.metadata.creationTime).getTime();
      if (isAnonymous && createdAt < cutoff) {
        uidsToDelete.push(user.uid);
        console.log(
          `   -> เจอ user ${user.uid} (สร้าง ${new Date(createdAt).toISOString()}) -> จะลบ`
        );
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  if (uidsToDelete.length === 0) {
    console.log("   ไม่มี user ที่ต้องลบ");
  } else {
    // ลบจริง
    for (let i = 0; i < uidsToDelete.length; i += 1000) {
      const batch = uidsToDelete.slice(i, i + 1000);
      await auth.deleteUsers(batch);
    }
    console.log(`   ลบแล้ว ${uidsToDelete.length} คน`);
  }

  // 4. ตรวจสอบ
  console.log("\n4) ตรวจสอบ...");
  try {
    await auth.getUser(uid);
    console.log(`   FAIL: user ${uid} ยังอยู่!`);
    process.exit(1);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      console.log(`   PASS: user ${uid} ถูกลบแล้ว`);
    } else {
      throw err;
    }
  }

  console.log("\n=== ทดสอบสำเร็จ! ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
