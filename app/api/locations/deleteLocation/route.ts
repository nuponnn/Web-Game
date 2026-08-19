import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { assertIsAdmin } from "@/app/lib/server/admin";
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

    const snap = await adminDb.ref(`locations/${locationId}`).once("value");
    if (!snap.exists()) {
      throw new ApiError("not-found", "ไม่พบ location");
    }

    await adminDb.ref(`locations/${locationId}`).remove();
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
