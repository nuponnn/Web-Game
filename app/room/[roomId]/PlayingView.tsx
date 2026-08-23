"use client";
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { endRound } from "@/app/lib/gameFunction";
import { Countdown } from "@/app/components/Countdown";
import { rldb } from "@/app/lib/firebase";
import type { Room } from "@/app/lib/useRoom";

type LocationItem = { id: string; name: string };

function loadCrossed(key: string | null): Record<string, boolean> {
  if (!key || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, value]) => typeof id === "string" && value === true
      )
    );
  } catch {
    // ignore
  }
  return {};
}

function LocationReference({
  roomId,
  roundId,
}: {
  roomId: string;
  roundId?: string;
}) {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const crossedKey = roundId ? `spyfall-crossed:${roomId}:${roundId}` : null;
  const [crossedOut, setCrossedOut] = useState<Record<string, boolean>>(() =>
    loadCrossed(crossedKey)
  );

  function toggleCrossed(id: string) {
    if (!crossedKey) return;

    setCrossedOut((current) => {
      const next = { ...current, [id]: !current[id] };
      try {
        window.localStorage.setItem(crossedKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  useEffect(() => {
    if (!crossedKey || typeof window === "undefined") return;

    try {
      const roomKeyPrefix = `spyfall-crossed:${roomId}:`;
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(roomKeyPrefix) && key !== crossedKey) {
          window.localStorage.removeItem(key);
        }
      }
      window.localStorage.setItem(`spyfall-crossed-active:${roomId}`, crossedKey);
    } catch {
      // ignore
    }
  }, [crossedKey, roomId]);

  useEffect(() => {
    let cancelled = false;
    const unsub = onValue(
      ref(rldb, "locations"),
      (snap) => {
        if (cancelled) return;
        const val = snap.val() as
          | Record<string, { name?: string; active?: boolean }>
          | null;
        const list = Object.entries(val || {})
          .filter(([, loc]) => loc.active === true && !!loc.name)
          .map(([id, loc]) => ({ id, name: loc.name as string }));
        list.sort((a, b) => a.name.localeCompare(b.name, "th"));
        setLocations(list);
      },
      () => {}
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (locations.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        สถานที่ที่เป็นไปได้
      </p>
      <div className="flex flex-wrap gap-1.5">
        {locations.map((loc) => (
          <button
            key={loc.id}
            type="button"
            aria-pressed={!!crossedOut[loc.id]}
            onClick={() => toggleCrossed(loc.id)}
            className={`min-h-8 rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-xs transition-colors ${
              crossedOut[loc.id]
                ? "bg-transparent text-text-muted line-through opacity-60"
                : "bg-surface text-text-secondary hover:bg-bg-subtle"
            }`}
          >
            {loc.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PlayingView({
  room,
  roomId,
  uid,
}: {
  room: Room;
  roomId: string;
  uid?: string;
}) {
  const [ending, setEnding] = useState(false);
  const isHost = uid === room.hostUid;
  const me = uid ? room.players[uid] : undefined;
  const roundId = room.round?.roundId;

  async function handleTimeout() {
    try {
      await endRound(roomId, "timeout");
    } catch {
      // silent
    }
  }

  async function handleHostEnd() {
    setEnding(true);
    try {
      await endRound(roomId, "host_ended");
    } catch {
      setEnding(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Countdown */}
        {room.round?.endsAt && (
          <div className="text-center">
            <Countdown endsAt={room.round.endsAt} onExpire={handleTimeout} />
          </div>
        )}

        {/* Role Card */}
        {me?.isSpy ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-danger/10">
              <span className="text-2xl">🕵️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-danger">
                คุณคือ Spy
              </h1>
              <p className="mt-1.5 text-sm text-text-secondary">
                ฟังให้ดีและเดาว่าสถานที่คืออะไร อย่าให้ใครจับได้ว่าคุณไม่รู้
              </p>
            </div>
          </div>
        ) : me?.isJoker ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-warning-light">
              <span className="text-2xl">🃏</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-warning">
                คุณคือ Joker
              </h1>
              <p className="mt-1.5 text-sm text-text-secondary">
                เห็นสถานที่แต่ไม่มี role เป้าหมาย: ต้องโดนโหวตออก!
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Location
              </p>
              <p className="mt-0.5 text-base font-medium text-text">
                {room.location}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <span className="text-2xl">👤</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-text">
                คุณคือคนท้องถิ่น
              </h1>
              <p className="mt-1.5 text-sm text-text-secondary">
                หา Spy ก่อนหมดเวลา
              </p>
            </div>
            <div className="space-y-2">
              <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Location
                </p>
                <p className="mt-0.5 text-base font-medium text-text">
                  {room.location}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Your role
                </p>
                <p className="mt-0.5 text-base font-medium text-accent">
                  {me?.role}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Location Reference */}
        <LocationReference key={roundId ?? "no-round"} roomId={roomId} roundId={roundId} />

        {/* Host End Button */}
        {isHost && (
          <button
            onClick={handleHostEnd}
            disabled={ending}
            className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ending ? "กำลังจบรอบ..." : "จบ Round"}
          </button>
        )}
      </div>
    </main>
  );
}
