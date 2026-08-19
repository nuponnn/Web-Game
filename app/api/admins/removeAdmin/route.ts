import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb, adminAuth } from "@/app/lib/server/firebaseAdmin";
import { assertIsAdmin } from "@/app/lib/server/admin";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid: callerUid } = await verifyAuth(req);
    await assertIsAdmin(callerUid);

    const body = await req.json();
    const uid: string = body?.uid;
    if (!uid || typeof uid !== "string" || uid.length === 0) {
      throw new ApiError("invalid-argument", "ต้องระบุ uid");
    }
    if (uid === callerUid) {
      throw new ApiError("invalid-argument", "ลบตัวเองไม่ได้ (กัน lock out)");
    }

    const adminRef = adminDb.ref(`admins/${uid}`);
    if (!(await adminRef.once("value")).exists()) {
      throw new ApiError("not-found", "user นี้ไม่ใช่ admin");
    }

    // รวม logic จาก adminRemoved trigger: ลบ record RTDB แล้วลบ auth user
    await adminRef.remove();

    try {
      await adminAuth.deleteUser(uid);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "auth/user-not-found") throw err;
    }

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
