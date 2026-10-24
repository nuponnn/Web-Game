"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRoom } from "@/app/lib/useRoom";
import { useAuth } from "@/app/lib/useAuth";
import { usePresence } from "@/app/lib/usePresence";
import { leaveRoom } from "@/app/lib/gameFunction";
import LobbyView from "./LobbyView";
import PlayingView from "./PlayingView";
import VotingView from "./VotingView";
import GuessView from "./GuessView";
import RevealView from "./RevealView";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { room, loading } = useRoom(roomId, user?.uid);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const enabled = !!(user && room?.players?.[user.uid]);
  usePresence(roomId, user?.uid, enabled);

  const kicked = !!user?.uid && !!room && !room.players[user.uid];
  const isHost = !!user?.uid && room?.hostUid === user.uid;

  useEffect(() => {
    if (kicked) router.push("/");
  }, [kicked, router]);

 async function doLeave() {
  if (leaving) return;
  setConfirmOpen(false);
  setLeaving(true);
  setLeaveError("");
  try {
    await leaveRoom(roomId);
    router.push("/");
  } catch (err) {
    setLeaveError(
      err instanceof Error ? err.message : "ออกจากห้องไม่สำเร็จ กรุณาลองอีกครั้ง",
    );
    setLeaving(false);
  }
}

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
            ห้องถูกปิดไปแล้ว (host อาจออกจากห้อง หรือห้องหมดเวลา)
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

  const content = (() => {
    switch (room.status) {
      case "lobby":
        return <LobbyView room={room} roomId={roomId} uid={user?.uid} />;
      case "playing":
        return <PlayingView room={room} roomId={roomId} uid={user?.uid} />;
      case "voting":
        return <VotingView room={room} roomId={roomId} uid={user?.uid} />;
      case "guessing":
        return <GuessView room={room} roomId={roomId} uid={user?.uid} />;
      case "reveal":
        return <RevealView room={room} roomId={roomId} uid={user?.uid} />;
      default:
        return (
          <div className="flex min-h-dvh items-center justify-center">
            <p className="text-sm text-text-secondary">สถานะไม่รู้จัก</p>
          </div>
        );
    }
  })();

  return (
    <>
    {confirmOpen && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-sm space-y-4 rounded-[var(--radius-md)] bg-surface p-4">
      <p className="text-sm">
        {isHost
          ? "ยุบห้องนี้ทันที? ผู้เล่นทุกคนจะออกจากห้องและข้อมูลรอบนี้จะถูกลบ"
          : "ออกจากห้องนี้?"}
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={() => setConfirmOpen(false)} className="px-3 py-1.5 text-sm">
          ยกเลิก
        </button>
        <button onClick={doLeave} className="px-3 py-1.5 text-sm text-danger">
          ยืนยัน
        </button>
      </div>
    </div>
  </div>
)}
      <button
        type="button"
       onClick={() => setConfirmOpen(true)}
        disabled={leaving}
        aria-label={isHost ? "ยุบห้อง" : "ออกจากห้อง"}
        className="fixed right-4 top-4 z-50 min-h-9 rounded-[var(--radius-md)] border border-border bg-surface/95 px-3 py-1.5 text-xs font-medium text-text-secondary shadow-sm transition-colors hover:bg-bg-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
      >
        {leaving ? "..." : isHost ? "ยุบห้อง" : "ออกห้อง"}
      </button>
      {leaveError && (
        <p
          role="alert"
          className="fixed right-4 top-16 z-50 max-w-xs rounded-[var(--radius-md)] bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {leaveError}
        </p>
      )}
      {content}
    </>
  );
}
