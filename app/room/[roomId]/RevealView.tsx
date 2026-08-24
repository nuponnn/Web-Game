"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Room } from "@/app/lib/useRoom";
import { playAgain } from "@/app/lib/gameFunction";

type RevealStep =
  | "voted-out"
  | "guess"
  | "location"
  | "joker"
  | "spy"
  | "winner"
  | "done";

const STEP_ORDER: RevealStep[] = [
  "voted-out",
  "guess",
  "location",
  "joker",
  "spy",
  "winner",
  "done",
];

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
  const [step, setStep] = useState<RevealStep>("voted-out");
  const result = room.result;

  const spyNames = result
    ? result.spyUids.map(
        (spyUid) => room.players[spyUid]?.name || "ไม่ทราบชื่อ"
      )
    : [];
  const jokerNames = result
    ? (result.jokerUids || []).map(
        (jokerUid) => room.players[jokerUid]?.name || "ไม่ทราบชื่อ"
      )
    : [];
  const votedOutName =
    result?.votedOutUid
      ? room.players[result.votedOutUid]?.name
      : null;
  const isHost = uid === room?.hostUid;

  const isPlayerWin = result?.winner === "players";
  const isDraw = result?.winner === "draw";
  const isTeamWin = result?.winner === "team";

  const hasJoker = jokerNames.length > 0;
  const hasGuess = !!room.guess;

  // Advance through reveal steps
  useEffect(() => {
    if (!result) return;

    // ทุก step เปิดเผยช้าๆ 2.5 วิ ยกเว้นประกาศผล (2 วิ)
    const getDelay = (current: RevealStep): number =>
      current === "winner" ? 2000 : 2500;

    const getNextStep = (current: RevealStep): RevealStep | null => {
      const idx = STEP_ORDER.indexOf(current);
      if (idx < 0 || idx >= STEP_ORDER.length - 1) return null;
      // ข้าม step ที่ไม่มีข้อมูล (ไม่มีการเดา / ไม่มี joker)
      let next = STEP_ORDER[idx + 1];
      while (
        next !== "done" &&
        ((next === "guess" && !hasGuess) || (next === "joker" && !hasJoker))
      ) {
        next = STEP_ORDER[STEP_ORDER.indexOf(next) + 1];
      }
      return next;
    };

    if (step === "done") return;

    const next = getNextStep(step);
    if (!next) {
      const timer = setTimeout(() => setStep("done"), getDelay(step));
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setStep(next), getDelay(step));
    return () => clearTimeout(timer);
  }, [step, result, hasJoker, hasGuess]);

  if (!result) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-text-secondary">กำลังประมวลผล...</p>
      </div>
    );
  }

  const isRevealed = (target: RevealStep): boolean => {
    const currentIdx = STEP_ORDER.indexOf(step);
    const targetIdx = STEP_ORDER.indexOf(target);
    return targetIdx < currentIdx || step === "done";
  };

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
      {/* Spotlight overlay - shows current reveal big in center */}
      {step !== "done" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 backdrop-blur-sm">
          <div className="w-full max-w-sm px-6">
            {/* Voted Out Spotlight - แสดงแค่ชื่อ ยังไม่เฉลย role */}
            {step === "voted-out" && (
              <div className="spotlight-card text-center">
                <p className="text-sm font-medium uppercase tracking-widest text-text-muted mb-4">
                  ผลโหวต
                </p>
                <p className="text-3xl font-bold text-text leading-tight">
                  {votedOutName
                    ? `โหวตออก: ${votedOutName}`
                    : "คะแนนเสมอ"}
                </p>
                {votedOutName && (
                  <p className="mt-3 text-lg text-text-secondary">
                    1 คนโดนโหวตออกจากเกม
                  </p>
                )}
              </div>
            )}

            {/* Spy's Guess Spotlight - ยังไม่บอกว่าถูก/ผิด */}
            {step === "guess" && room.guess && (
              <div className="spotlight-card text-center">
                <div className="text-5xl mb-4">📍</div>
                <p className="text-sm font-medium uppercase tracking-widest text-accent/60 mb-3">
                  Spy ทายสถานที่
                </p>
                <p className="text-3xl font-bold text-text leading-tight">
                  {room.guess.locationName}
                </p>
              </div>
            )}

            {/* Actual Location Spotlight */}
            {step === "location" && (
              <div className="spotlight-card text-center">
                <p className="text-sm font-medium uppercase tracking-widest text-accent/60 mb-4">
                  สถานที่จริงคือ
                </p>
                <p className="text-4xl font-bold text-accent">
                  {room.location}
                </p>
                {room.guess && (
                  <p
                    className={`mt-3 text-lg font-medium ${
                      room.guess.locationName === room.location
                        ? "text-success"
                        : "text-danger"
                    }`}
                  >
                    {room.guess.locationName === room.location
                      ? "Spy ทายถูก!"
                      : "Spy ทายผิด"}
                  </p>
                )}
              </div>
            )}

            {/* Joker Spotlight */}
            {step === "joker" && hasJoker && (
              <div className="spotlight-card text-center">
                <div className="text-5xl mb-4">🃏</div>
                <p className="text-sm font-medium uppercase tracking-widest text-warning/70 mb-3">
                  Joker คือ
                </p>
                <p className="text-3xl font-bold text-warning">
                  {jokerNames.join(", ")}
                </p>
              </div>
            )}

            {/* Spy Spotlight */}
            {step === "spy" && (
              <div className="spotlight-card text-center">
                <div className="text-5xl mb-4">🕵️</div>
                <p className="text-sm font-medium uppercase tracking-widest text-danger/60 mb-3">
                  Spy คือ
                </p>
                <p className="text-3xl font-bold text-danger">
                  {spyNames.join(", ")}
                </p>
              </div>
            )}

            {/* Winner Spotlight */}
            {step === "winner" && (
              <div className="spotlight-card text-center">
                <div className="text-6xl mb-4">
                  {isPlayerWin ? "🎉" : isDraw ? "🤝" : isTeamWin ? "🎭" : "🕵️"}
                </div>
                <h1
                  className={`text-4xl font-bold ${
                    isPlayerWin
                      ? "text-success"
                      : isDraw
                        ? "text-text"
                        : isTeamWin
                          ? "text-warning"
                          : "text-danger"
                  }`}
                >
                  {isPlayerWin
                    ? "ผู้เล่นชนะ!"
                    : isDraw
                      ? "เสมอ!"
                      : isTeamWin
                        ? "Spy & Joker ชนะ!"
                        : "Spy ชนะ!"}
                </h1>
                {isTeamWin && (
                  <p className="mt-2 text-sm text-text-secondary">
                    {[...spyNames, ...jokerNames].join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* List view - reveals accumulate as spotlight moves on */}
      <div className="w-full max-w-sm space-y-3">
        {/* Voted Out - ไม่เฉลย role */}
        {isRevealed("voted-out") && (
          <div className="reveal-settled rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              ผลโหวต
            </p>
            <p className="mt-0.5 text-sm font-medium text-text">
              {votedOutName
                ? `คนที่โดนโหวตออก: ${votedOutName}`
                : "คะแนนเสมอ ไม่มีใครถูกจับ"}
            </p>
          </div>
        )}

        {/* Spy's Guess */}
        {isRevealed("guess") && room.guess && (
          <div className="reveal-settled rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📍</span>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  คำตอบของ Spy
                </p>
                <p className="mt-0.5 text-sm font-bold text-text">
                  {room.guess.locationName}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actual Location */}
        {isRevealed("location") && (
          <div className="reveal-settled rounded-[var(--radius-md)] border border-accent/30 bg-accent-light px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-accent/60">
              สถานที่จริง
            </p>
            <p className="mt-0.5 text-base font-bold text-accent">
              {room.location}
            </p>
            {room.guess && (
              <p
                className={`mt-1 text-xs font-medium ${
                  room.guess.locationName === room.location
                    ? "text-success"
                    : "text-danger"
                }`}
              >
                Spy {room.guess.locationName === room.location ? "ทายถูก" : "ทายผิด"}
              </p>
            )}
          </div>
        )}

        {/* Joker */}
        {hasJoker && isRevealed("joker") && (
          <div className="reveal-settled rounded-[var(--radius-md)] border border-warning/30 bg-warning-light px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🃏</span>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-warning/70">
                  Joker
                </p>
                <p className="text-sm font-bold text-warning">
                  {jokerNames.join(", ")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Spy */}
        {isRevealed("spy") && (
          <div className="reveal-settled rounded-[var(--radius-md)] border border-danger/30 bg-danger/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🕵️</span>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-danger/60">
                  Spy
                </p>
                <p className="text-sm font-bold text-danger">
                  {spyNames.join(", ")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Winner badge */}
        {isRevealed("winner") && (
          <div className="reveal-settled text-center pt-2">
            <div
              className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full ${
                isPlayerWin
                  ? "bg-success-light"
                  : isDraw
                    ? "bg-bg-subtle"
                    : isTeamWin
                      ? "bg-warning-light"
                      : "bg-danger/10"
              }`}
            >
              <span className="text-2xl">
                {isPlayerWin ? "🎉" : isDraw ? "🤝" : isTeamWin ? "🎭" : "🕵️"}
              </span>
            </div>
            <h1
              className={`mt-2 text-xl font-bold ${
                isPlayerWin
                  ? "text-success"
                  : isDraw
                    ? "text-text"
                    : isTeamWin
                      ? "text-warning"
                      : "text-danger"
              }`}
            >
              {isPlayerWin
                ? "ผู้เล่นชนะ!"
                : isDraw
                  ? "เสมอ!"
                  : isTeamWin
                    ? "Spy & Joker ชนะ!"
                    : "Spy ชนะ!"}
            </h1>
            {isTeamWin && (
              <p className="mt-1 text-xs text-text-secondary">
                {[...spyNames, ...jokerNames].join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Actions - only after done */}
        {step === "done" && (
          <div className="reveal-settled pt-2">
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
