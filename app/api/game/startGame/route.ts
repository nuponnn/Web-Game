import { NextRequest } from "next/server";
import { verifyAuth } from "@/app/lib/server/verifyAuth";
import { adminDb } from "@/app/lib/server/firebaseAdmin";
import {
  getRoomOrThrow,
  assertStatus,
  assertIsHost,
  assertAuthed,
} from "@/app/lib/server/roomState";
import { assignRoles, randomInt, shuffled } from "@/app/lib/server/locations";
import {
  DEFAULT_ROUND_DURATION_MS,
  DEFAULT_VOTE_DURATION_MS,
  MAX_JOKER_COUNT,
  MAX_ROUND_DURATION_MS,
  MAX_VOTE_DURATION_MS,
  MIN_PLAYERS,
  MIN_ROUND_DURATION_MS,
  MIN_VOTE_DURATION_MS,
} from "@/app/lib/server/constants";
import { ApiError } from "@/app/lib/server/errors";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await verifyAuth(req);
    assertAuthed(uid);

    const body = await req.json();
    const roomId: string = body?.roomId;
    if (!roomId) throw new ApiError("invalid-argument", "ต้องระบุ roomId");

    const room = await getRoomOrThrow(roomId);
    assertStatus(room, "lobby");
    assertIsHost(room, uid);

    const playerIds = Object.keys(room.players || {});
    if (playerIds.length < MIN_PLAYERS) {
      throw new ApiError("failed-precondition", `ต้องมีผู้เล่นอย่างน้อย ${MIN_PLAYERS} คน`);
    }

    const locationsSnap = await adminDb
      .ref("locations")
      .orderByChild("active")
      .equalTo(true)
      .once("value");

    const locationsVal = locationsSnap.val() as
      | Record<string, { name: string; roles: string[] }>
      | null;

    const activeLocations = Object.entries(locationsVal || {}).map(([id, loc]) => ({
      id,
      name: loc.name,
      roles: loc.roles,
    }));

    if (activeLocations.length === 0) {
      throw new ApiError(
        "failed-precondition",
        "ยังไม่มีสถานที่ที่เปิดใช้งานอยู่ในระบบ กรุณาให้ admin เพิ่ม location ก่อน",
      );
    }

    const requestedLocationId =
      typeof body?.locationId === "string" && body.locationId.length > 0
        ? body.locationId
        : room.selectedLocationId;

    let location: (typeof activeLocations)[number];
    if (requestedLocationId) {
      const chosen = activeLocations.find((l) => l.id === requestedLocationId);
      if (!chosen) {
        throw new ApiError(
          "invalid-argument",
          "location ที่เลือกไม่มีอยู่หรือถูกปิดการใช้งานแล้ว",
        );
      }
      location = chosen;
    } else {
      location = activeLocations[randomInt(activeLocations.length)];
    }

    const requestedSpyCount =
      typeof body?.spyCount === "number" && Number.isInteger(body.spyCount)
        ? body.spyCount
        : room.spyCount ?? 1;

    if (requestedSpyCount < 1 || requestedSpyCount >= playerIds.length) {
      throw new ApiError(
        "invalid-argument",
        `จำนวน spy ต้องอยู่ระหว่าง 1 ถึง ${playerIds.length - 1} (ต้องเหลือคนปกติอย่างน้อย 1 คน)`,
      );
    }

    const requestedJokerCount =
      typeof body?.jokerCount === "number" && Number.isInteger(body.jokerCount)
        ? Math.max(0, Math.min(MAX_JOKER_COUNT, body.jokerCount))
        : room.jokerCount ?? 0;

    if (requestedSpyCount + requestedJokerCount >= playerIds.length) {
      const total = requestedSpyCount + requestedJokerCount;
      throw new ApiError(
        "invalid-argument",
        `spy + joker = ${total} ต้องน้อยกว่าผู้เล่น ${playerIds.length} คน`,
      );
    }

    const requestedRoundDuration =
      typeof body?.roundDuration === "number" && Number.isFinite(body.roundDuration)
        ? body.roundDuration
        : room.roundDuration ?? DEFAULT_ROUND_DURATION_MS;
    const roundDurationMs = Math.max(
      MIN_ROUND_DURATION_MS,
      Math.min(MAX_ROUND_DURATION_MS, requestedRoundDuration),
    );

    const requestedVoteDuration =
      typeof body?.voteDuration === "number" && Number.isFinite(body.voteDuration)
        ? body.voteDuration
        : room.voteDuration ?? DEFAULT_VOTE_DURATION_MS;
    const voteDurationMs = Math.max(
      MIN_VOTE_DURATION_MS,
      Math.min(MAX_VOTE_DURATION_MS, requestedVoteDuration),
    );

    const shuffledPlayerIds = shuffled(playerIds);
    const spyUids = shuffledPlayerIds.slice(0, requestedSpyCount);
    const spySet = new Set(spyUids);
    const nonSpyIds = playerIds.filter((id) => !spySet.has(id));

    const shuffledNonSpy = shuffled(nonSpyIds);
    const jokerUids = shuffledNonSpy.slice(0, requestedJokerCount);
    const jokerSet = new Set(jokerUids);
    const nonSpyNonJokerIds = nonSpyIds.filter((id) => !jokerSet.has(id));

    const roles = assignRoles(location, nonSpyNonJokerIds.length);
    const roleByUid: Record<string, string> = {};
    const roundId = `${Date.now()}-${randomInt(1_000_000)}`;
    nonSpyNonJokerIds.forEach((id, i) => {
      roleByUid[id] = roles[i];
    });

    const updates: Record<string, unknown> = {};
    const privateUpdates: Record<string, unknown> = {};
    playerIds.forEach((id) => {
      const isSpy = spySet.has(id);
      const isJoker = jokerSet.has(id);
      const isNormal = !isSpy && !isJoker;
      privateUpdates[`roomPrivate/${roomId}/${id}`] = {
        roundId,
        isSpy,
        isJoker,
        ...(isNormal
          ? { role: roleByUid[id], location: location.name }
          : isJoker
            ? { location: location.name }
            : {}),
      };
      updates[`rooms/${roomId}/players/${id}/isSpy`] = null;
      updates[`rooms/${roomId}/players/${id}/isJoker`] = null;
      updates[`rooms/${roomId}/players/${id}/role`] = null;
    });

    const { ServerValue } = await import("firebase-admin/database");

    updates[`rooms/${roomId}/location`] = null;
    updates[`rooms/${roomId}/locationId`] = location.id;
    updates[`rooms/${roomId}/selectedLocationId`] = requestedLocationId ?? null;
    updates[`rooms/${roomId}/status`] = "playing";
    updates[`rooms/${roomId}/votes`] = null;
    updates[`rooms/${roomId}/result`] = null;
    updates[`rooms/${roomId}/round/roundId`] = roundId;
    updates[`rooms/${roomId}/round/duration`] = roundDurationMs;
    updates[`rooms/${roomId}/round/startedAt`] = ServerValue.TIMESTAMP;
    updates[`rooms/${roomId}/spyCount`] = requestedSpyCount;
    updates[`rooms/${roomId}/roundDuration`] = roundDurationMs;
    updates[`rooms/${roomId}/voteDuration`] = voteDurationMs;
    updates[`rooms/${roomId}/jokerCount`] = requestedJokerCount;

    await adminDb.ref().update({ ...updates, ...privateUpdates });

    const startedAtSnap = await adminDb
      .ref(`rooms/${roomId}/round/startedAt`)
      .once("value");
    const startedAt = startedAtSnap.val() as number;
    const endsAt = startedAt + roundDurationMs;

    await adminDb.ref(`rooms/${roomId}/round/endsAt`).set(endsAt);

    return Response.json({
      ok: true,
      endsAt,
      spyCount: spyUids.length,
      jokerCount: requestedJokerCount,
      roundDuration: roundDurationMs,
      voteDuration: voteDurationMs,
    });
  } catch (e) {
    if (e instanceof ApiError) return e.toResponse();
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
