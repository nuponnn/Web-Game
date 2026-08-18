"use client";
import { useEffect, useState } from "react";
import { get, onValue, ref } from "firebase/database";
import { startGame, kickPlayer } from "@/app/lib/gameFunction";
import { rldb } from "@/app/lib/firebase";
import { useAuth } from "@/app/lib/useAuth";
import type { Room } from "@/app/lib/useRoom";

type LocationItem = { id: string; name: string };
type LocationInfo = { name: string; roles: string[] };

export default function LobbyView({
  room,
  roomId,
  uid,
}: {
  room: Room;
  roomId: string;
  uid?: string;
}) {
  const { user } = useAuth();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState(
    room.selectedLocationId ?? ""
  );
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [spyCount, setSpyCount] = useState(room.spyCount ?? 1);
  const [jokerCount, setJokerCount] = useState(room.jokerCount ?? 0);
  const [roundDurationMin, setRoundDurationMin] = useState(
    Math.round((room.roundDuration ?? 8 * 60 * 1000) / 60 / 1000)
  );
  const [voteDurationSec, setVoteDurationSec] = useState(
    Math.round((room.voteDuration ?? 30 * 1000) / 1000)
  );
  const [isAdminHost, setIsAdminHost] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const isHost = uid === room.hostUid;
  const playerList = Object.entries(room.players);
  const effectiveLocationId = isHost
    ? selectedLocationId
    : room.selectedLocationId ?? "";

  useEffect(() => {
    if (!isHost || !user || user.isAnonymous) return;

    let cancelled = false;
    let unsub: (() => void) | null = null;

    get(ref(rldb, `admins/${user.uid}`))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) return;
        setIsAdminHost(true);

        unsub = onValue(
          ref(rldb, "locations"),
          (locationsSnap) => {
            if (cancelled) return;
            const val = locationsSnap.val() as
              | Record<string, { name: string; active: boolean }>
              | null;
            const list = Object.entries(val || {})
              .filter(([, loc]) => loc.active === true)
              .map(([id, loc]) => ({ id, name: loc.name }));
            list.sort((a, b) => (a.name < b.name ? -1 : 1));
            setLocations(list);
          },
          (err) => {
            if (cancelled) return;
            console.error("load locations error:", err);
            setError("โหลด location ไม่สำเร็จ");
          }
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("admin check error:", err);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [isHost, user]);

  useEffect(() => {
    if (!effectiveLocationId) {
      setLocationInfo(null);
      return;
    }
    let cancelled = false;
    const unsub = onValue(
      ref(rldb, `locations/${effectiveLocationId}`),
      (snap) => {
        if (cancelled) return;
        const val = snap.val() as LocationInfo | null;
        setLocationInfo(val ?? null);
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [effectiveLocationId]);

  async function handleStart() {
    setStarting(true);
    setError("");
    try {
      await startGame(roomId, {
        locationId: selectedLocationId || undefined,
        spyCount,
        jokerCount,
        roundDuration: roundDurationMin * 60 * 1000,
        voteDuration: voteDurationSec * 1000,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เริ่มเกมไม่สำเร็จ");
      setStarting(false);
    }
  }

  async function handleKick(targetUid: string) {
    setKicking(targetUid);
    setError("");
    try {
      await kickPlayer(roomId, targetUid);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เตะผู้เล่นไม่สำเร็จ");
    } finally {
      setKicking(null);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        {/* Room Code */}
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Room
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-widest text-text">
            {roomId}
          </h1>
        </div>

        {/* Players */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-secondary">
              ผู้เล่น
            </h2>
            <span className="text-xs text-text-muted">
              {playerList.length}/8
            </span>
          </div>
          <div className="space-y-1.5">
            {playerList.map(([playerUid, player]) => (
              <div
                key={playerUid}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface px-4 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  {/* Online indicator */}
                  <span
                    className={`h-2 w-2 rounded-full ${
                      player.online ? "bg-success" : "bg-text-muted"
                    }`}
                  />
                  <span className="text-sm font-medium text-text">
                    {player.name}
                  </span>
                  {playerUid === room.hostUid && (
                    <span className="rounded-[var(--radius-sm)] bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      host
                    </span>
                  )}
                  {playerUid === uid && (
                    <span className="text-[10px] text-text-muted">(คุณ)</span>
                  )}
                </div>
                {isHost && playerUid !== uid && (
                  <button
                    onClick={() => handleKick(playerUid)}
                    disabled={kicking !== null}
                    className="text-xs text-text-muted transition-colors hover:text-danger"
                  >
                    {kicking === playerUid ? "..." : "x"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Location Info */}
        {locationInfo && locationInfo.roles.length > 0 && (
          <div className="rounded-[var(--radius-md)] border border-accent/20 bg-accent-light p-4">
            <p className="text-sm font-medium text-accent">
              {locationInfo.name}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {locationInfo.roles.length} roles
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {locationInfo.roles.map((role) => (
                <span
                  key={role}
                  className="rounded-[var(--radius-sm)] bg-surface px-2 py-1 text-xs text-text-secondary"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        )}

        {selectedLocationId && locationInfo === null && (
          <p className="text-center text-xs text-text-muted">
            กำลังโหลดข้อมูลสถานที่...
          </p>
        )}

        {/* Host Settings */}
        {isHost && (
          <div className="space-y-3">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle"
            >
              <span>ตั้งค่าเกม</span>
              <svg
                className={`h-4 w-4 text-text-muted transition-transform ${
                  showSettings ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showSettings && (
              <div className="space-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-4">
                {isAdminHost && (
                  <div className="space-y-1">
                    <label className="block text-xs text-text-secondary">
                      Location
                    </label>
                    <select
                      value={selectedLocationId}
                      onChange={(e) => setSelectedLocationId(e.target.value)}
                      className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                    >
                      <option value="">Random</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    {locations.length === 0 && (
                      <p className="text-xs text-warning">
                        No active locations. Add some in Admin first.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs text-text-secondary">
                      Spy count
                    </label>
                    <select
                      value={spyCount}
                      onChange={(e) => setSpyCount(Number(e.target.value))}
                      className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-text-secondary">
                      Joker count
                    </label>
                    <select
                      value={jokerCount}
                      onChange={(e) => setJokerCount(Number(e.target.value))}
                      className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                    >
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-text-secondary">
                      Spy time
                    </label>
                    <select
                      value={roundDurationMin}
                      onChange={(e) => setRoundDurationMin(Number(e.target.value))}
                      className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((m) => (
                        <option key={m} value={m}>
                          {m}m
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-text-secondary">
                      Vote time
                    </label>
                    <select
                      value={voteDurationSec}
                      onChange={(e) => setVoteDurationSec(Number(e.target.value))}
                      className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                    >
                      {[10, 15, 20, 30, 45, 60, 90, 120].map((s) => (
                        <option key={s} value={s}>
                          {s >= 60 ? `${s / 60}m` : `${s}s`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Start / Waiting */}
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={starting || playerList.length < 3}
            className="w-full rounded-[var(--radius-md)] bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting
              ? "กำลังเริ่ม..."
              : playerList.length < 3
                ? "ต้องมีอย่างน้อย 3 คน"
                : "เริ่มเกม"}
          </button>
        ) : (
          <div className="text-center">
            <p className="text-sm text-text-secondary">รอ host เริ่มเกม...</p>
            <div className="mt-2 flex justify-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-[var(--radius-md)] bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
