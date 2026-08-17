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
  // แยกกรณี "ยังไม่ได้โหวต" กับ "โหวต skip (ไม่โหวตใคร)" — สองอย่างนี้ต่างกัน
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
      // เงียบไว้ - อาจมีคนอื่นเรียกไปแล้ว หรือโหวตครบก่อนหมดเวลา
    }
  }

  return (
    <div>
      <h2>ใครคือ Spy?</h2>

      {room.round?.voteEndsAt && (
        <Countdown endsAt={room.round.voteEndsAt} onExpire={handleVoteTimeout} />
      )}

      <p>โหวตแล้ว {votesSoFar} / {totalPlayers}</p>

      <ul>
        {playerList.map(([playerUid, player]) => (
          <li key={playerUid}>
            {player.name}
            {playerUid === uid && " (คุณ)"}
            {playerUid === room.hostUid && " (host)"}
            {myVoteTarget === playerUid && " ✓"}
            <button
              onClick={() => handleVote(playerUid)}
              disabled={voting}
              style={{ marginLeft: 8 }}
            >
              {myVoteTarget === playerUid ? "เปลี่ยนโหวต" : "โหวต"}
            </button>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => handleVote(null)}
          disabled={voting}
          style={{
            padding: "6px 16px",
            border: "1px solid #999",
            borderRadius: 4,
            background: votedSkip ? "#e0e0e0" : undefined,
          }}
        >
          {votedSkip ? "ไม่โหวต (✓)" : "ไม่โหวต"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
