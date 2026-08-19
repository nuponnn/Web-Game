import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import { assertIsAdmin } from "@/app/lib/server/admin";
import { ApiError } from "@/app/lib/server/errors";

interface AdminDoc {
  email?: string | null;
  displayName?: string | null;
  addedAt?: number;
  addedBy?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    await assertIsAdmin(uid);

    const snap = await adminDb.ref("admins").once("value");
    const val = snap.val() as Record<string, AdminDoc> | null;

    const admins = Object.entries(val || {}).map(([uid, data]) => ({ uid, ...data }));
    admins.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));

    return Response.json({ admins });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
