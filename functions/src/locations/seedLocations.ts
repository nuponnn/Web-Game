import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import { ServerValue } from "firebase-admin/database";
import { assertIsAdmin } from "../lib/admin";
import { LOCATIONS } from "../data/locations";

// เติม location พื้นฐาน (จาก data/locations.ts) เข้า database
// - ข้ามตัวที่ชื่อซ้ำกับที่มีอยู่แล้ว (รันซ้ำได้ไม่พัง)
// - ใช้ตอนตั้งค่าระบบครั้งแรก หลังนี้ admin เพิ่ม/แก้ผ่านหน้าเว็บเอง
export const seedLocations = onCall(async (request) => {
  const uid = await assertIsAdmin(request.auth?.uid);

  const db = admin.database();

  const existingSnap = await db.ref("locations").once("value");
  const existing = existingSnap.val() as Record<string, { name?: string }> | null;
  const existingNames = new Set(
    Object.values(existing || {}).map((loc) => (loc.name || "").toLowerCase())
  );

  let added = 0;
  for (const loc of LOCATIONS) {
    if (existingNames.has(loc.name.toLowerCase())) continue;

    const newRef = db.ref("locations").push();
    await newRef.set({
      name: loc.name,
      roles: loc.roles,
      active: true,
      createdAt: ServerValue.TIMESTAMP,
      createdBy: uid,
    });
    added++;
  }

  return { ok: true, added };
});
