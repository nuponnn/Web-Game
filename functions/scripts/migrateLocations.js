"use strict";
// ============================================================================
// One-off script: migrate location จาก static file เก่า -> เข้า Realtime Database
// (locations/{locationId}) เพื่อให้ระบบอ่าน location จาก database แทนโค้ด
//
// วิธีรัน:
//   ต้อง build functions ก่อนเพื่อให้ lib/data/locations.js มีอยู่
//     cd functions && npm run build
//
//   1) กับ Emulator (รัน emulators ก่อน):
//     cd functions
//     FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 node scripts/migrateLocations.js
//
//   2) กับ production:
//     cd functions
//     GOOGLE_APPLICATION_CREDENTIALS=../service-account.json \
//     FIREBASE_DATABASE_URL=https://<project>.firebaseio.com \
//     node scripts/migrateLocations.js
//
// สคริปต์จะข้าม location ที่ชื่อซ้ำกับที่มีอยู่แล้วใน DB (กันรันซ้ำ)
// ============================================================================
const admin = require("firebase-admin");
const { LOCATIONS } = require("../lib/data/locations");

let config = {};
if (process.env.FIREBASE_CONFIG) {
  // โหมดที่ Firebase ตั้ง env ให้เอง (เช่น Cloud Functions / shell)
  config = JSON.parse(process.env.FIREBASE_CONFIG);
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const creds = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  config = {
    projectId: creds.project_id,
    credential: admin.credential.cert(creds),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  };
} else if (process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  // Emulator: ไม่ต้องมี credential
  config = {};
} else {
  console.error("ต้องตั้ง GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_DATABASE_URL หรือ FIREBASE_DATABASE_EMULATOR_HOST");
  process.exit(1);
}

admin.initializeApp(config);

// แปลงชื่อภาษาไทยเป็น id ภาษาอังกฤษคร่าวๆ (กัน id ดูไม่รู้เรื่อง)
function slugify(name) {
  const map = {
    โรงพยาบาล: "hospital",
    เครื่องบิน: "airplane",
    ร้านอาหาร: "restaurant",
    โรงเรียน: "school",
    ธนาคาร: "bank",
  };
  return (
    map[name] ||
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

async function main() {
  const db = admin.database();
  let migrated = 0;
  let skipped = 0;

  for (let i = 0; i < LOCATIONS.length; i++) {
    const loc = LOCATIONS[i];
    const id = `${slugify(loc.name)}-${i + 1}`;
    const ref = db.ref(`locations/${id}`);

    const existing = await ref.child("name").once("value");
    if (existing.exists()) {
      console.log(`skip ${id}: มี location นี้อยู่แล้วใน DB`);
      skipped++;
      continue;
    }

    await ref.set({
      name: loc.name,
      roles: loc.roles,
      active: true,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: "migration",
    });
    console.log(`migrated ${id}: ${loc.name} (${loc.roles.length} roles)`);
    migrated++;
  }

  console.log(`done: migrated=${migrated} skipped=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("migrateLocations failed:", err);
    process.exit(1);
  });
