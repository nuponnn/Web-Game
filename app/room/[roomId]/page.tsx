"use client";
import { useParams, useRouter } from "next/navigation";
import { useRoom } from "@/app/lib/useRoom";
import { useAuth } from "@/app/lib/useAuth"; // ถ้ามี hook เช็ค user ปัจจุบัน
import { usePresence } from "@/app/lib/usePresence";
import LobbyView from "./LobbyView";
import PlayingView from "./PlayingView";
import VotingView from "./VotingView";
import RevealView from "./RevealView";
export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { room, loading } = useRoom(roomId);
  const { user } = useAuth();

  // แจ้ง server ว่าอยู่ในห้อง แล้วลบห้องอัตโนมัติถ้า host หลุด (ต้องอยู่ก่อน early return)
  usePresence(roomId, user?.uid, !!room);

  if (loading) return <div>กำลังโหลด...</div>;

  // หาห้องไม่เจอ = roomId พิมพ์ผิด หรือห้องถูกลบไปแล้ว (host หลุด / ค้างเกิน 6 ชม.)
  // ให้ user กลับหน้าแรกได้ แทนที่จะติดอยู่หน้านี้
  if (!room)
    return (
      <div>
        <p>ไม่พบห้องนี้ (ห้องอาจถูกลบไปแล้ว หรือ roomId ไม่ถูกต้อง)</p>
        <button onClick={() => router.push("/")}>กลับหน้าแรก</button>
      </div>
    );

  // ถ้าผู้เล่นถูกเตะออกจากห้อง (ไม่อยู่ใน players อีก) ให้กลับหน้าแรก
  if (user?.uid && !room.players[user.uid]) {
    router.push("/");
    return <div>คุณถูกเตะออกจากห้อง กำลังกลับหน้าแรก...</div>;
  }

  switch (room.status) {
    case "lobby":
      return <LobbyView room={room} roomId={roomId} uid={user?.uid} />;
    case "playing":
      return <PlayingView room={room} roomId={roomId} uid={user?.uid} />;
    case "voting":
      return <VotingView room={room} roomId={roomId} uid={user?.uid} />;
    case "reveal":
      return <RevealView room={room} roomId={roomId} uid={user?.uid} />;
    default:
      return <div>สถานะไม่รู้จัก</div>;
  }
}