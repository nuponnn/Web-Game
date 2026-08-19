import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { assertIsAdmin } from "@/app/lib/server/admin";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid: callerUid } = await verifyAuth(req);
    await assertIsAdmin(callerUid);

    const body = await req.json();
    const uid: string = body?.uid;
    if (!uid || typeof uid !== "string" || uid.length === 0) {
      throw new ApiError("invalid-argument", "ต้องระบุ uid ของคนที่จะให้เป็น admin");
    }
    if (uid === callerUid) {
      throw new ApiError("invalid-argument", "คุณเป็น admin อยู่แล้ว");
    }

    let userRecord;
    try {
      const { adminAuth } = await import("@/app/lib/server/firebaseAdmin");
      userRecord = await adminAuth.getUser(uid);
    } catch {
      throw new ApiError(
        "not-found",
        "ไม่พบ user นี้ใน Firebase Auth (ต้องให้คนนั้นลอง login ผ่าน Google มาอย่างน้อย 1 ครั้งก่อน)",
      );
    }

    const adminRef = adminDb.ref(`admins/${uid}`);
    if ((await adminRef.once("value")).exists()) {
      throw new ApiError("already-exists", "user นี้เป็น admin อยู่แล้ว");
    }

    const { ServerValue } = await import("firebase-admin/database");

    await adminRef.set({
      email: userRecord.email ?? null,
      displayName: userRecord.displayName ?? null,
      addedAt: ServerValue.TIMESTAMP,
      addedBy: callerUid,
    });

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
