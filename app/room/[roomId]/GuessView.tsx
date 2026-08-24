"use client";
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { resolveGuess, submitGuess } from "@/app/lib/gameFunction";
import { Countdown } from "@/app/components/Countdown";
import { rldb } from "@/app/lib/firebase";
import type { Room } from "@/app/lib/useRoom";

type LocationItem = { id: string; name: string };

export default function GuessView({
  room,
  roomId,
  uid,
}: {
  room: Room;
  roomId: string;
  uid?: string;
}) {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  async function handleTimeout() {
    try {
      await resolveGuess(roomId);
    } catch {
      // silent - คนอื่นอาจ resolve ไปแล้ว
    }
  }

  async function handleSubmit() {
    if (!selected || submitting || room.guess) return;
    setSubmitting(true);
    setError("");
    try {
      await submitGuess(roomId, selected);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ส่งคำตอบไม่สำเร็จ");
      setSubmitting(false);
    }
  }

  const me = uid ? room.players[uid] : undefined;
  const canGuess = !!me?.canGuess;
  const myGuess = room.guess;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-text-muted">
            จบการโหวต
          </p>
          <h1 className="mt-1 text-xl font-bold text-text">
            มีคนโดนโหวตออก!
          </h1>
        </div>

        {/* Countdown */}
        {!myGuess && room.round?.guessEndsAt && (
          <div className="text-center">
            <Countdown endsAt={room.round.guessEndsAt} onExpire={handleTimeout} />
          </div>
        )}

        {myGuess ? (
          /* มีการเดาแล้ว - ทุกคนเห็นเหมือนกัน (ยังไม่บอกว่าถูก/ผิด) */
          <div className="space-y-3 text-center">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <span className="text-2xl">📍</span>
            </div>
            <p className="text-sm font-medium text-text">
              ทายสถานที่: {myGuess.locationName}
            </p>
            <p className="text-sm text-text-secondary">กำลังเปิดเผยผล...</p>
          </div>
        ) : canGuess ? (
          /* UI เฉพาะ spy ที่ได้สิทธิ์ (canGuess merge จาก roomPrivate เฉพาะเจ้าของ) */
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-danger">
                คุณได้เวลาเดาสถานที่!
              </h2>
              <p className="mt-1 text-xs text-text-secondary">
                เลือกสถานที่ที่คิดว่าถูกต้อง ถ้าทายถูกจะไม่แพ้
              </p>
            </div>

            {locations.length === 0 ? (
              <p className="text-center text-xs text-text-muted">
                กำลังโหลดรายชื่อสถานที่...
              </p>
            ) : (
              <div className="flex flex-wrap justify-center gap-1.5">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    aria-pressed={selected === loc.name}
                    onClick={() => setSelected(loc.name)}
                    className={`min-h-9 rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs transition-colors ${
                      selected === loc.name
                        ? "border-accent bg-accent text-white"
                        : "border-border bg-surface text-text-secondary hover:bg-bg-subtle"
                    }`}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!selected || submitting}
              className="w-full rounded-[var(--radius-md)] bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "กำลังส่ง..."
                : selected
                  ? `ยืนยัน: ${selected}`
                  : "เลือกสถานที่ก่อน"}
            </button>

            {error && (
              <div className="rounded-[var(--radius-md)] bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}
          </div>
        ) : (
          /* คนอื่นเห็นแค่หน้ารอ - ไม่บอกว่าใครกำลังเดา */
          <div className="space-y-2 text-center">
            <p className="text-sm font-medium text-text">
              รอการเดาสถานที่...
            </p>
            <div className="flex justify-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
