import { auth } from "./firebase";

async function apiCall<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `API error ${res.status}`);
  }
  return data as T;
}

export async function createRoom(
  name: string,
  options?: { locationId?: string; spyCount?: number; jokerCount?: number; roundDuration?: number; voteDuration?: number; guessDuration?: number }
) {
  return apiCall<{ roomId: string }>("/api/rooms/createRoom", {
    name,
    ...(options?.locationId ? { locationId: options.locationId } : {}),
    ...(options?.spyCount ? { spyCount: options.spyCount } : {}),
    ...(options?.jokerCount !== undefined ? { jokerCount: options.jokerCount } : {}),
    ...(options?.roundDuration ? { roundDuration: options.roundDuration } : {}),
    ...(options?.voteDuration ? { voteDuration: options.voteDuration } : {}),
    ...(options?.guessDuration ? { guessDuration: options.guessDuration } : {}),
  });
}

export async function joinRoom(roomId: string, name: string) {
  return apiCall<{ ok: true }>("/api/rooms/joinRoom", { roomId, name });
}

export async function startGame(
  roomId: string,
  options?: { locationId?: string; spyCount?: number; jokerCount?: number; roundDuration?: number; voteDuration?: number; guessDuration?: number }
) {
  return apiCall<{ ok: true; endsAt: number; spyCount: number; jokerCount: number; roundDuration: number; voteDuration: number; guessDuration: number }>(
    "/api/game/startGame",
    {
      roomId,
      ...(options?.locationId ? { locationId: options.locationId } : {}),
      ...(options?.spyCount ? { spyCount: options.spyCount } : {}),
      ...(options?.jokerCount !== undefined ? { jokerCount: options.jokerCount } : {}),
      ...(options?.roundDuration ? { roundDuration: options.roundDuration } : {}),
      ...(options?.voteDuration ? { voteDuration: options.voteDuration } : {}),
      ...(options?.guessDuration ? { guessDuration: options.guessDuration } : {}),
    },
  );
}

export async function endRound(roomId: string, reason: "timeout" | "host_ended") {
  return apiCall<{ ok: true; voteEndsAt: number }>("/api/game/endRound", { roomId, reason });
}

export async function castVote(roomId: string, targetUid?: string | null) {
  return apiCall<{ ok: true; votesSoFar: number; totalPlayers: number }>(
    "/api/game/castVote",
    { roomId, targetUid: targetUid ?? null },
  );
}

export async function resolveVote(roomId: string) {
  return apiCall<{ ok: true }>("/api/game/resolveVote", { roomId });
}

export async function submitGuess(roomId: string, locationName: string) {
  return apiCall<{ ok: true }>("/api/game/submitGuess", { roomId, locationName });
}

export async function resolveGuess(roomId: string) {
  return apiCall<{ ok: true }>("/api/game/resolveGuess", { roomId });
}

export async function playAgain(roomId: string) {
  return apiCall<{ ok: true }>("/api/game/playAgain", { roomId });
}

export async function kickPlayer(roomId: string, targetUid: string) {
  return apiCall<{ ok: true; kickedName: string }>("/api/game/kickPlayer", { roomId, targetUid });
}

export async function leaveRoom(roomId: string) {
  return apiCall<{ ok: true }>("/api/rooms/leaveRoom", { roomId });
}

export async function closeRoom(roomId: string) {
  return apiCall<{ ok: true }>("/api/rooms/closeRoom", { roomId });
}
