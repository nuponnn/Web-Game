import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getRoomOrThrow, assertStatus, assertAuthed } from "../lib/roomState";
import { ServerValue } from "firebase-admin/database";
import { MAX_PLAYERS } from "../lib/constants";

export const joinRoom = onCall(async (request) => {
  const uid = request.auth?.uid;
  assertAuthed(uid);

  const roomId: string = request.data?.roomId?.toUpperCase();
  const name: string = request.data?.name?.trim();
  if (!roomId || !name) {
    throw new HttpsError("invalid-argument", "ต้องระบุ roomId และชื่อผู้เล่น");
  }

  const room = await getRoomOrThrow(roomId);

  // เข้าห้องได้เฉพาะตอน lobby เท่านั้น กันคนเข้าห้องที่เล่นไปแล้ว
  assertStatus(room, "lobby");

  const currentPlayers = room.players ? Object.values(room.players) : [];
  if (currentPlayers.length >= MAX_PLAYERS) {
    throw new HttpsError("resource-exhausted", "ห้องเต็มแล้ว");
  }

  const nameTaken = currentPlayers.some((p) => p.name === name);
  if (nameTaken) {
    throw new HttpsError("already-exists", "มีคนใช้ชื่อนี้ในห้องแล้ว");
  }

  await admin
    .database()
    .ref(`rooms/${roomId}/players/${uid}`)
    .set({
      name,
      online: true,
      joinedAt: ServerValue.TIMESTAMP,
    });

  return { ok: true };
});
