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
  const hasVoted = uid ? Boolean(room.votes?.[uid]) : false;
  const votesSoFar = room.votes ? Object.keys(room.votes).length : 0;
  const totalPlayers = playerList.length;

  async function handleVote(targetUid: string) {
    setVoting(true);
    setError("");
    try {
      await castVote(roomId, targetUid);
      // ไม่ต้องทำอะไรต่อ - hasVoted จะเปลี่ยนเองผ่าน room.votes ที่ subscribe อยู่
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหวตไม่สำเร็จ");
    } finally {
      setVoting(false);
    }
  }

  // เรียก resolveVote เมื่อหมดเวลาโหวต - ตัดสินผลจากโหวตที่มีอยู่
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

      {/* แสดงเวลาถอยหลังโหวต ถ้ามี voteEndsAt */}
      {room.round?.voteEndsAt && (
        <Countdown endsAt={room.round.voteEndsAt} onExpire={handleVoteTimeout} />
      )}

      <p>โหวตแล้ว {votesSoFar} / {totalPlayers}</p>

      {!hasVoted ? (
        <ul>
          {playerList
            .filter(([playerUid]) => playerUid !== uid) // ห้ามโหวตตัวเอง
            .map(([playerUid, player]) => (
              <li key={playerUid}>
                {player.name}{" "}
                <button onClick={() => handleVote(playerUid)} disabled={voting}>
                  โหวต
                </button>
              </li>
            ))}
        </ul>
      ) : (
        <div>
          <p>คุณโหวตแล้ว รอคนอื่น...</p>
          <ul>
            {Object.entries(room.votes || {}).map(([voterUid, vote]) => (
              <li key={voterUid}>
                {room.players[voterUid]?.name || "ผู้เล่น"}
               
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
