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
    // Countdown เรียกอันนี้เองตอนหมดเวลา - แค่คนแรกที่กดถึงจะสำเร็จ
    // คนอื่นเรียกซ้ำได้ backend เช็ค status เองว่าไม่ใช่ "playing" แล้วก็จะ error เฉยๆ ไม่พัง
    try {
      await endRound(roomId, "timeout");
    } catch {
      // เงียบไว้ได้ เพราะอาจมีคนอื่นเรียกไปแล้ว
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
    <div>
      {room.round?.endsAt && (
        <Countdown endsAt={room.round.endsAt} onExpire={handleTimeout} />
      )}

      {me?.isSpy ? (
        <div>
          <h2>คุณคือ Spy</h2>
          <p>พยายามฟังคนอื่นแล้วเดาสถานที่ให้ได้ ห้ามให้คนอื่นจับได้ว่าคุณไม่รู้สถานที่</p>
        </div>
      ) : (
        <div>
          <h2>สถานที่: {room.location}</h2>
          <p>บทบาทของคุณ: {me?.role}</p>
        </div>
      )}

      {isHost && (
        <button onClick={handleHostEnd} disabled={ending}>
          {ending ? "กำลังจบรอบ..." : "End Round"}
        </button>
      )}
    </div>
  );
}