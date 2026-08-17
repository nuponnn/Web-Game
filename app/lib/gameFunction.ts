import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export async function createRoom(
  name: string,
  options?: { locationId?: string; spyCount?: number; jokerCount?: number; roundDuration?: number; voteDuration?: number }
) {
  const fn = httpsCallable(functions, "createRoom");
  const res = await fn({
    name,
    ...(options?.locationId ? { locationId: options.locationId } : {}),
    ...(options?.spyCount ? { spyCount: options.spyCount } : {}),
    ...(options?.jokerCount !== undefined ? { jokerCount: options.jokerCount } : {}),
    ...(options?.roundDuration ? { roundDuration: options.roundDuration } : {}),
    ...(options?.voteDuration ? { voteDuration: options.voteDuration } : {}),
  });
  return res.data as { roomId: string };
}

export async function joinRoom(roomId: string, name: string) {
  const fn = httpsCallable(functions, "joinRoom");
  const res = await fn({ roomId, name });
  return res.data as { ok: true };
}

export async function startGame(
  roomId: string,
  options?: { locationId?: string; spyCount?: number; jokerCount?: number; roundDuration?: number; voteDuration?: number }
) {
  const fn = httpsCallable(functions, "startGame");
  const res = await fn({
    roomId,
    ...(options?.locationId ? { locationId: options.locationId } : {}),
    ...(options?.spyCount ? { spyCount: options.spyCount } : {}),
    ...(options?.jokerCount !== undefined ? { jokerCount: options.jokerCount } : {}),
    ...(options?.roundDuration ? { roundDuration: options.roundDuration } : {}),
    ...(options?.voteDuration ? { voteDuration: options.voteDuration } : {}),
  });
  return res.data as { ok: true; endsAt: number; spyCount: number; jokerCount: number; roundDuration: number; voteDuration: number };
}

export async function endRound(roomId: string, reason: "timeout" | "host_ended") {
  const fn = httpsCallable(functions, "endRound");
  const res = await fn({ roomId, reason });
  return res.data as { ok: true; voteEndsAt: number };
}

export async function castVote(roomId: string, targetUid?: string | null) {
  const fn = httpsCallable(functions, "castVote");
  const res = await fn({ roomId, targetUid: targetUid ?? null });
  return res.data as { ok: true; votesSoFar: number; totalPlayers: number };
}

// เรียกเมื่อหมดเวลาโหวตหรือโหวตครบทุกคน เพื่อตัดสินผลและเปลี่ยนเป็น reveal
export async function resolveVote(roomId: string) {
  const fn = httpsCallable(functions, "resolveVote");
  const res = await fn({ roomId });
  return res.data as { ok: true };
}

export async function playAgain(roomId: string) {
  const fn = httpsCallable(functions, "playAgain");
  const res = await fn({ roomId });
  return res.data as { ok: true };
}

// host เตะผู้เล่นออกจากห้อง (เฉพาะตอน lobby)
export async function kickPlayer(roomId: string, targetUid: string) {
  const fn = httpsCallable(functions, "kickPlayer");
  const res = await fn({ roomId, targetUid });
  return res.data as { ok: true; kickedName: string };
}