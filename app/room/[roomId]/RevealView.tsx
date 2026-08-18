"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Room } from "@/app/lib/useRoom";
import { playAgain } from "@/app/lib/gameFunction";

export default function RevealView({
  room,
  roomId,
  uid,
}: {
  room: Room;
  roomId: string;
  uid?: string;
}) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const result = room.result;

  if (!result) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-text-secondary">กำลังประมวลผล...</p>
      </div>
    );
  }

  const spyNames = result.spyUids.map(
    (spyUid) => room.players[spyUid]?.name || "ไม่ทราบชื่อ"
  );
  const jokerNames = (result.jokerUids || []).map(
    (jokerUid) => room.players[jokerUid]?.name || "ไม่ทราบชื่อ"
  );
  const votedOutName = result.votedOutUid
    ? room.players[result.votedOutUid]?.name
    : null;
  const isHost = uid === room.hostUid;

  const isPlayerWin = result.winner === "players";
  const isJokerWin = result.winner === "joker";
  const isSpyWin = result.winner === "spy";

  async function handlePlayAgain() {
    setResetting(true);
    setError("");
    try {
      await playAgain(roomId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เริ่มรอบใหม่ไม่สำเร็จ");
      setResetting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        {/* Winner Badge */}
        <div className="text-center">
          <div
            className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full ${
              isPlayerWin
                ? "bg-success-light"
                : isJokerWin
                  ? "bg-warning-light"
                  : "bg-danger/10"
            }`}
          >
            <span className="text-2xl">
              {isPlayerWin ? "🎉" : isJokerWin ? "🃏" : "🕵️"}
            </span>
          </div>
          <h1
            className={`mt-3 text-xl font-bold ${
              isPlayerWin
                ? "text-success"
                : isJokerWin
                  ? "text-warning"
                  : "text-danger"
            }`}
          >
            {isPlayerWin
              ? "ผู้เล่นชนะ!"
              : isJokerWin
                ? "Joker ชนะ!"
                : "Spy ชนะ!"}
          </h1>
        </div>

        {/* Result Details */}
        <div className="space-y-2">
          <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              สถานที่
            </p>
            <p className="mt-0.5 text-base font-medium text-text">
              {room.location}
            </p>
          </div>

          <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Spy คือ
            </p>
            <p className="mt-0.5 text-base font-medium text-danger">
              {spyNames.join(", ")}
            </p>
          </div>

          {jokerNames.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Joker คือ
              </p>
              <p className="mt-0.5 text-base font-medium text-warning">
                {jokerNames.join(", ")}
              </p>
            </div>
          )}

          <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              ผลโหวต
            </p>
            <p className="mt-0.5 text-sm text-text">
              {votedOutName
                ? isJokerWin
                  ? `${votedOutName} เป็น Joker และโดนโหวตออก`
                  : `คนที่โดนโหวตออก: ${votedOutName}`
                : "คะแนนเสมอ ไม่มีใครถูกจับ"}
            </p>
          </div>
        </div>

        {/* Actions */}
        {isHost ? (
          <div className="space-y-2">
            <button
              onClick={handlePlayAgain}
              disabled={resetting}
              className="w-full rounded-[var(--radius-md)] bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetting ? "กำลังกลับเข้าห้อง..." : "เล่นรอบใหม่"}
            </button>
            <button
              onClick={() => router.push("/")}
              className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle"
            >
              กลับหน้าแรก
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-text-secondary">
            รอ host กดเริ่มรอบใหม่...
          </p>
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
