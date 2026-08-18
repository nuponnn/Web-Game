"use client";
import { useState } from "react";
import { endRound } from "@/app/lib/gameFunction";
import { Countdown } from "@/app/components/Countdown";
import type { Room } from "@/app/lib/useRoom";

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
