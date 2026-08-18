"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRoom } from "@/app/lib/useRoom";
import { useAuth } from "@/app/lib/useAuth";
import { usePresence } from "@/app/lib/usePresence";
import LobbyView from "./LobbyView";
import PlayingView from "./PlayingView";
import VotingView from "./VotingView";
import RevealView from "./RevealView";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { room, loading } = useRoom(roomId, user?.uid);

  usePresence(roomId, user?.uid, !!room);

  const kicked = !!user?.uid && !!room && !room.players[user.uid];
  useEffect(() => {
    if (kicked) router.push("/");
  }, [kicked, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-text-secondary">กำลังโหลด...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-sm text-text-secondary">
            ไม่พบห้องนี้ (ห้องอาจถูกลบไปแล้ว หรือรหัสไม่ถูกต้อง)
          </p>
          <button
            onClick={() => router.push("/")}
            className="rounded-[var(--radius-md)] bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            กลับหน้าแรก
          </button>
        </div>
      </div>
    );
  }

  if (kicked) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-text-secondary">
          คุณถูกเตะออกจากห้อง กำลังกลับหน้าแรก...
        </p>
      </div>
    );
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
      return (
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-sm text-text-secondary">สถานะไม่รู้จัก</p>
        </div>
      );
  }
}
