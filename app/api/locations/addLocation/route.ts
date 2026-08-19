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
    const { name, roles } = cleanAndValidateLocation({
      name: body?.name,
      roles: body?.roles,
    });

    const existingSnap = await adminDb
      .ref("locations")
      .orderByChild("name")
      .equalTo(name)
      .once("value");
    if (existingSnap.exists()) {
      throw new ApiError("already-exists", "มีสถานที่ชื่อนี้อยู่แล้ว");
    }

    const { ServerValue } = await import("firebase-admin/database");

    const newRef = adminDb.ref("locations").push();
    await newRef.set({
      name,
      roles,
      active: true,
      createdAt: ServerValue.TIMESTAMP,
      createdBy: uid,
    });

    return Response.json({ ok: true, locationId: newRef.key });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
