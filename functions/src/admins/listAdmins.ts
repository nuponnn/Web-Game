import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import { assertIsAdmin } from "../lib/admin";

interface AdminDoc {
  email?: string | null;
  displayName?: string | null;
  addedAt?: number;
  addedBy?: string;
}

// เอา list admin ทั้งหมด (ต้องเป็น admin เท่านั้น)
// อ่านผ่าน admin SDK เพราะ rules ปิดไม่ให้ client list admins ออกมา
export const listAdmins = onCall(async (request) => {
  await assertIsAdmin(request.auth?.uid);

  const snap = await admin.database().ref("admins").once("value");
  const val = snap.val() as Record<string, AdminDoc> | null;

  const admins = Object.entries(val || {}).map(([uid, data]) => ({ uid, ...data }));
  admins.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));

  return { admins };
});
