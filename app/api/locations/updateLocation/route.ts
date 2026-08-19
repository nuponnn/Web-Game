import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { assertIsAdmin } from "@/app/lib/server/admin";
import { cleanAndValidateLocation } from "@/app/lib/server/locations";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    await assertIsAdmin(uid);

    const body = await req.json();
    const locationId: string = body?.locationId;
    if (!locationId) {
      throw new ApiError("invalid-argument", "ต้องระบุ locationId");
    }

    const { name, roles } = cleanAndValidateLocation({
      name: body?.name,
      roles: body?.roles,
    });

    const locationSnap = await adminDb.ref(`locations/${locationId}`).once("value");
    if (!locationSnap.exists()) {
      throw new ApiError("not-found", "ไม่พบ location");
    }

    const existingSnap = await adminDb
      .ref("locations")
      .orderByChild("name")
      .equalTo(name)
      .once("value");
    const existing = existingSnap.val() as Record<string, unknown> | null;
    for (const id of Object.keys(existing || {})) {
      if (id !== locationId) {
        throw new ApiError("already-exists", "มีสถานที่ชื่อนี้อยู่แล้ว");
      }
    }

    const { ServerValue } = await import("firebase-admin/database");

    await adminDb.ref(`locations/${locationId}`).update({
      name,
      roles,
      updatedAt: ServerValue.TIMESTAMP,
      updatedBy: uid,
    });

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
