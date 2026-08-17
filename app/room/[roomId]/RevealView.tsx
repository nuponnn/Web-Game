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
    return <div>กำลังประมวลผล...</div>;
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

  async function handlePlayAgain() {
    setResetting(true);
    setError("");
    try {
      await playAgain(roomId);
      // สถานะห้องเปลี่ยนเป็น "lobby" -> RoomPage จะสลับไปแสดง LobbyView ให้อัตโนมัติ
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เริ่มรอบใหม่ไม่สำเร็จ");
      setResetting(false);
    }
  }

  return (
    <div>
      <h2>
        {result.winner === "players" ? "ผู้เล่นชนะ!" :
         result.winner === "joker" ? "Joker ชนะ!" :
         "Spy ชนะ!"}
      </h2>
      <p>สถานที่คือ: {room.location}</p>
      <p>Spy คือ: {spyNames.join(", ")}</p>
      {jokerNames.length > 0 && (
        <p>Joker คือ: {jokerNames.join(", ")}</p>
      )}
      <p>
        {votedOutName
          ? result.winner === "joker"
            ? `${votedOutName} เป็น Joker และโดนโหวตออก -> Joker ชนะ!`
            : `คนที่โดนโหวตออก: ${votedOutName}`
          : "คะแนนเสมอ ไม่มีใครถูกจับ"}
      </p>
      {isHost ? (
        <p>
          <button onClick={handlePlayAgain} disabled={resetting}>
            {resetting ? "กำลังกลับเข้าห้อง..." : "กลับเข้าห้อง (เล่นรอบใหม่)"}
          </button>{" "}
          <button onClick={() => router.push("/")}>กลับหน้าแรก</button>
        </p>
      ) : (
        <p>รอ host กดเริ่มรอบใหม่...</p>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
