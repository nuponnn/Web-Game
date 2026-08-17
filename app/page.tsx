"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { get, onValue, ref } from "firebase/database";
import { createRoom, joinRoom } from "./lib/gameFunction";
import { useAuth } from "./lib/useAuth";
import { rldb } from "@/firebase";

type LocationItem = { id: string; name: string };

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [spyCount, setSpyCount] = useState(1);
  const [roundDurationMin, setRoundDurationMin] = useState(8); // default 8 นาที
  const [voteDurationSec, setVoteDurationSec] = useState(30); // default 30 วินาที
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // ถ้าเป็น admin (Google + อยู่ใน admins/{uid}) ให้โหลดลิสต์ location ที่ active
  // เพื่อเลือกตอนสร้างห้องได้เอง
  useEffect(() => {
    if (loading || !user || user.isAnonymous) return;

    let cancelled = false;
    let unsub: (() => void) | null = null;

    get(ref(rldb, `admins/${user.uid}`))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) return; // ไม่ใช่ admin -> สร้างห้องแบบสุ่ม location
        setIsAdmin(true);

        unsub = onValue(
          ref(rldb, "locations"),
          (locationsSnap) => {
            if (cancelled) return;
            const val = locationsSnap.val() as
              | Record<string, { name: string; active: boolean }>
              | null;
            const list = Object.entries(val || {})
              .filter(([, loc]) => loc.active === true)
              .map(([id, loc]) => ({ id, name: loc.name }));
            list.sort((a, b) => (a.name < b.name ? -1 : 1));
            setLocations(list);
          },
          (err) => {
            if (cancelled) return;
            console.error("load locations error:", err);
          }
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("admin check error:", err);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [loading, user]);

  if (loading) return <div>กำลังเข้าสู่ระบบ...</div>;

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      // ส่งตัวเลือก location/spy เฉพาะตอนเป็น admin (ไม่ใช่ admin -> สุ่ม/ค่า default)
      // roundDuration/voteDuration ส่งทุกคน (host ทุกคนกำหนดเวลาได้)
      const res = await createRoom(
        name,
        isAdmin
          ? {
              locationId: selectedLocationId || undefined,
              spyCount,
              roundDuration: roundDurationMin * 60 * 1000,
              voteDuration: voteDurationSec * 1000,
            }
          : {
              roundDuration: roundDurationMin * 60 * 1000,
              voteDuration: voteDurationSec * 1000,
            }
      );
      router.push(`/room/${res.roomId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "สร้างห้องไม่สำเร็จ");
      setCreating(false);
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
    <div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ" />

      {isAdmin && (
        <div style={{ display: "flex", gap: 12, margin: "8px 0" }}>
          <label>
            สถานที่:{" "}
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
            >
              <option value="">สุ่ม</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            จำนวน Spy:{" "}
            <select value={spyCount} onChange={(e) => setSpyCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} คน
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, margin: "8px 0" }}>
        <label>
          เวลาหา Spy:{" "}
          <select
            value={roundDurationMin}
            onChange={(e) => setRoundDurationMin(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((m) => (
              <option key={m} value={m}>
                {m} นาที
              </option>
            ))}
          </select>
        </label>
        <label>
          เวลาโหวต:{" "}
          <select
            value={voteDurationSec}
            onChange={(e) => setVoteDurationSec(Number(e.target.value))}
          >
            {[10, 15, 20, 30, 45, 60, 90, 120].map((s) => (
              <option key={s} value={s}>
                {s >= 60 ? `${s / 60} นาที` : `${s} วินาที`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button onClick={handleCreate} disabled={creating || name.trim().length === 0}>
        {creating ? "กำลังสร้าง..." : "Create Room"}
      </button>

      <div style={{ margin: "8px 0" }}>
        <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Room ID" />
        <button onClick={handleJoin}>Join Room</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <p>
        <Link href="/admin">Admin</Link>
      </p>
    </div>
  );
}
