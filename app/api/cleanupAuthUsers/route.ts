import { NextRequest } from "next/server";
import { adminAuth } from "@/app/lib/server/firebaseAdmin";
import { ApiError } from "@/app/lib/server/errors";

// ป้องกันด้วย secret key
function assertCronSecret(req: NextRequest) {
  const secret = req.headers.get("X-CRON-SECRET");
  if (!secret || secret !== process.env.CRON_SECRET) {
    throw new ApiError("permission-denied", "Invalid cron secret");
  }
}

async function cleanup(cutoffMs: number): Promise<number> {
  const cutoff = Date.now() - cutoffMs;
  const uidsToDelete: string[] = [];
  let nextPageToken: string | undefined;

  do {
    const result = await adminAuth.listUsers(1000, nextPageToken);
    for (const user of result.users) {
      const isAnonymous = user.providerData.length === 0;
      const createdAt = new Date(user.metadata.creationTime).getTime();
      if (isAnonymous && createdAt < cutoff) {
        uidsToDelete.push(user.uid);
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  for (let i = 0; i < uidsToDelete.length; i += 1000) {
    await adminAuth.deleteUsers(uidsToDelete.slice(i, i + 1000));
  }

  return uidsToDelete.length;
}

export async function POST(req: NextRequest) {
  try {
    assertCronSecret(req);

    const body = await req.json().catch(() => ({}));
    const cutoffSeconds = typeof body?.cutoffSeconds === "number" ? body.cutoffSeconds : 24 * 60 * 60;
    const cutoffMs = cutoffSeconds * 1000;

    const deleted = await cleanup(cutoffMs);

    return Response.json({ ok: true, deleted, cutoffSeconds });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
