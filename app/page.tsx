"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "./lib/gameFunction";
import { useAuth } from "./lib/useAuth";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"idle" | "create" | "join">("idle");
  const [roomId, setRoomId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode === "create" && name.trim().length > 0 && !creating) {
      handleCreate();
    }
  }, [mode]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-text-secondary">กำลังเข้าสู่ระบบ...</p>
      </div>
    );
  }

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      const res = await createRoom(name);
      router.push(`/room/${res.roomId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "สร้างห้องไม่สำเร็จ");
      setCreating(false);
      setMode("idle");
    }
  }

  async function handleJoin() {
    setError("");
    try {
      await joinRoom(roomId, name);
      router.push(`/room/${roomId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เข้าร่วมห้องไม่สำเร็จ");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-text">
            Spyfall
          </h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Find the spy among you
          </p>
        </div>

        {/* Name Input */}
        <div className="space-y-1.5">
          <label
            htmlFor="name"
            className="block text-sm font-medium text-text"
          >
            ชื่อของคุณ
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ใส่ชื่อเพื่อเริ่มเล่น"
            className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {/* Action Buttons */}
        {mode === "idle" && (
          <div className="space-y-3">
            <button
              onClick={() => {
                if (name.trim().length === 0) return;
                setMode("create");
              }}
              disabled={name.trim().length === 0}
              className="w-full rounded-[var(--radius-md)] bg-accent px-4 py-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              สร้างห้อง
            </button>

            <button
              onClick={() => {
                if (name.trim().length === 0) return;
                setMode("join");
              }}
              disabled={name.trim().length === 0}
              className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3.5 text-sm font-medium text-text transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              เข้าร่วมห้อง
            </button>
          </div>
        )}

        {/* Join Room Input */}
        {mode === "join" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="roomId"
                className="block text-sm font-medium text-text"
              >
                รหัสห้อง
              </label>
              <input
                id="roomId"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="ใส่รหัส 4 ตัวอักษร"
                maxLength={4}
                autoFocus
                className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-center text-base font-medium uppercase tracking-widest text-text placeholder:text-text-muted placeholder:tracking-normal placeholder:font-normal focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMode("idle");
                  setRoomId("");
                }}
                className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle"
              >
                กลับ
              </button>
              <button
                onClick={handleJoin}
                disabled={roomId.length < 4}
                className="flex-1 rounded-[var(--radius-md)] bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                เข้าร่วม
              </button>
            </div>
          </div>
        )}

        {/* Creating indicator */}
        {mode === "create" && creating && (
          <div className="text-center">
            <p className="text-sm text-text-secondary">กำลังสร้างห้อง...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-[var(--radius-md)] bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Admin Link */}
        <div className="text-center">
          <Link
            href="/admin"
            className="text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            Admin
          </Link>
        </div>
      </div>
    </main>
  );
}
