"use client";
import { useState } from "react";
import { castVote, resolveVote } from "@/app/lib/gameFunction";
import { Countdown } from "@/app/components/Countdown";
import type { Room } from "@/app/lib/useRoom";

export default function VotingView({
  room,
  roomId,
  uid,
}: {
  room: Room;
  roomId: string;
  uid?: string;
}) {
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState("");

  const playerList = Object.entries(room.players);
  const myVote = uid ? room.votes?.[uid] : undefined;
  const hasVoted = myVote !== undefined;
  const myVoteTarget = myVote?.targetUid ?? null;
  const votedSkip = hasVoted && myVoteTarget === null;
  const votesSoFar = room.votes ? Object.keys(room.votes).length : 0;
  const totalPlayers = playerList.length;

  async function handleVote(targetUid: string | null) {
    setVoting(true);
    setError("");
    try {
      await castVote(roomId, targetUid);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหวตไม่สำเร็จ");
    } finally {
      setVoting(false);
    }
  }

  async function handleVoteTimeout() {
    try {
      await resolveVote(roomId);
    } catch {
      // silent
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-text">ใครคือ Spy?</h1>
        </div>

        {/* Countdown */}
        {room.round?.voteEndsAt && (
          <div className="text-center">
            <Countdown endsAt={room.round.voteEndsAt} onExpire={handleVoteTimeout} />
          </div>
        )}

        {/* Vote Count */}
        <div className="text-center">
          <p className="text-sm text-text-secondary">
            โหวตแล้ว <span className="font-medium text-text">{votesSoFar}</span> / {totalPlayers}
          </p>
        </div>

        {/* Player List */}
        <div className="space-y-1.5">
          {playerList.map(([playerUid, player]) => {
            const isSelected = myVoteTarget === playerUid;
            return (
              <div
                key={playerUid}
                className={`flex items-center justify-between rounded-[var(--radius-md)] border px-4 py-2.5 transition-colors ${
                  isSelected
                    ? "border-accent bg-accent-light"
                    : "border-border bg-surface"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">
                    {player.name}
                  </span>
                  {playerUid === uid && (
                    <span className="text-[10px] text-text-muted">(คุณ)</span>
                  )}
                  {playerUid === room.hostUid && (
                    <span className="rounded-[var(--radius-sm)] bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      host
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleVote(playerUid)}
                  disabled={voting}
                  className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-accent text-white hover:bg-accent-hover"
                      : "border border-border bg-surface text-text hover:bg-bg-subtle"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {isSelected ? "เปลี่ยน" : "โหวต"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Skip Vote */}
        <button
          onClick={() => handleVote(null)}
          disabled={voting}
          className={`w-full rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-medium transition-colors ${
            votedSkip
              ? "border-accent bg-accent-light text-accent"
              : "border-border bg-surface text-text hover:bg-bg-subtle"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {votedSkip ? "ไม่โหวต (เลือกแล้ว)" : "ไม่โหวต"}
        </button>

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
