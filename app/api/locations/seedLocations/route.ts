import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { assertIsAdmin } from "@/app/lib/server/admin";
import { LOCATIONS } from "@/app/lib/server/data/locations";
import { cleanAndValidateLocation } from "@/app/lib/server/locations";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    await assertIsAdmin(uid);

    const { ServerValue } = await import("firebase-admin/database");

    const existingSnap = await adminDb.ref("locations").once("value");
    const existing = existingSnap.val() as Record<string, { name?: string }> | null;
    const existingNames = new Set(
      Object.values(existing || {}).map((loc) => (loc.name || "").toLowerCase()),
    );

    const updates: Record<string, unknown> = {};
    let added = 0;
    for (const loc of LOCATIONS) {
      const clean = cleanAndValidateLocation(loc);
      if (existingNames.has(clean.name.toLowerCase())) continue;

      const newRef = adminDb.ref("locations").push();
      updates[`locations/${newRef.key}`] = {
        name: clean.name,
        roles: clean.roles,
        active: true,
        createdAt: ServerValue.TIMESTAMP,
        createdBy: uid,
      };
      added++;
    }

    if (added > 0) {
      await adminDb.ref().update(updates);
    }

    return Response.json({ ok: true, added });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
