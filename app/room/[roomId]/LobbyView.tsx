"use client";
import { useEffect, useState } from "react";
import { get, onValue, ref } from "firebase/database";
import { startGame, kickPlayer } from "@/app/lib/gameFunction";
import { rldb } from "@/app/lib/firebase";
import { useAuth } from "@/app/lib/useAuth";
import type { Room } from "@/app/lib/useRoom";

type LocationItem = { id: string; name: string };

// ข้อมูลสถานที่ที่เลือก (subscribe จาก locations/{id}) — ใช้โชว์ชื่อ + roles
// ให้ทุกคนในห้องเห็น (รวม host ที่ไม่ใช่ admin / ผู้เล่นทั่วไปด้วย)
type LocationInfo = { name: string; roles: string[] };

export default function LobbyView({
  room,
  roomId,
  uid,
}: {
  room: Room;
  roomId: string;
  uid?: string;
}) {
  const { user } = useAuth();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState(
    room.selectedLocationId ?? ""
  );
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [spyCount, setSpyCount] = useState(room.spyCount ?? 1);
  const [jokerCount, setJokerCount] = useState(room.jokerCount ?? 0);
  // ระยะเวลาหา spy (ms) - default 8 นาที
  const [roundDurationMin, setRoundDurationMin] = useState(
    Math.round((room.roundDuration ?? 8 * 60 * 1000) / 60 / 1000)
  );
  // ระยะเวลาโหวต (วินาที) - default 30 วินาที
  const [voteDurationSec, setVoteDurationSec] = useState(
    Math.round((room.voteDuration ?? 30 * 1000) / 1000)
  );
  const [isAdminHost, setIsAdminHost] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null); // uid ที่กำลังเตะ

  const isHost = uid === room.hostUid;
  const playerList = Object.entries(room.players); // [uid, playerData][]

  // Effective selected location: admin hosts use local state, others use room value
  const effectiveLocationId = isHost ? selectedLocationId : (room.selectedLocationId ?? "");

  // host ที่เป็น admin เท่านั้น: โหลดลิสต์ location ที่เปิดใช้งานอยู่ ให้เลือกได้ว่า
  // ห้องนี้จะเล่นสถานที่ไหน (ไม่เลือก = สุ่มเหมือนเดิม)
  useEffect(() => {
    if (!isHost || !user || user.isAnonymous) return;

    let cancelled = false;
    let unsub: (() => void) | null = null;

    get(ref(rldb, `admins/${user.uid}`))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) return; // ไม่ใช่ admin -> ไม่ได้เลือก location
        setIsAdminHost(true);

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
            setError("โหลด location ไม่สำเร็จ");
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
  }, [isHost, user]);

  // Subscribe to selected location's name + roles for all players to see
  useEffect(() => {
    if (!effectiveLocationId) {
      setLocationInfo(null);
      return;
    }
    let cancelled = false;
    const unsub = onValue(
      ref(rldb, `locations/${effectiveLocationId}`),
      (snap) => {
        if (cancelled) return;
        const val = snap.val() as LocationInfo | null;
        setLocationInfo(val ?? null);
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [effectiveLocationId]);

  async function handleStart() {
    setStarting(true);
    setError("");
    try {
      await startGame(roomId, {
        locationId: selectedLocationId || undefined,
        spyCount,
        jokerCount,
        roundDuration: roundDurationMin * 60 * 1000, // แปลงเป็น ms
        voteDuration: voteDurationSec * 1000, // แปลงเป็น ms
      });
      // ไม่ต้องทำอะไรต่อ - useRoom จะเห็น status เปลี่ยนเป็น "playing" เอง
      // แล้ว RoomPage จะ switch ไป PlayingView อัตโนมัติ
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เริ่มเกมไม่สำเร็จ");
      setStarting(false);
    }
  }

  async function handleKick(targetUid: string) {
    setKicking(targetUid);
    setError("");
    try {
      await kickPlayer(roomId, targetUid);
      // ไม่ต้องทำอะไรต่อ - useRoom subscribe จะอัปเดต players เอง
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เตะผู้เล่นไม่สำเร็จ");
    } finally {
      setKicking(null);
    }
  }

  return (
    <div>
      <h2>ห้อง {roomId}</h2>
      <p>ผู้เล่นในห้อง ({playerList.length} คน)</p>
      <ul>
        {playerList.map(([playerUid, player]) => (
          <li key={playerUid}>
            {player.name}
            {playerUid === room.hostUid && " (host)"}
            {!player.online && " (ออฟไลน์)"}
            {/* ปุ่มเตะ: host เตะได้เฉพาะคนอื่น ห้ามเตะตัวเอง */}
            {isHost && playerUid !== uid && (
              <button
                onClick={() => handleKick(playerUid)}
                disabled={kicking !== null}
                style={{ marginLeft: 8, color: "red" }}
              >
                {kicking === playerUid ? "กำลังเตะ..." : "เตะ"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* แสดง Roles ของสถานที่ที่เลือก */}
      {locationInfo && locationInfo.roles.length > 0 && (
        <div style={{ margin: "12px 0", padding: 12, background: "#f0f8ff", borderRadius: 8 }}>
          <p style={{ fontWeight: "bold", margin: "0 0 6px" }}>
            สถานที่: {locationInfo.name}
          </p>
          <p style={{ margin: "0 0 4px", color: "#555", fontSize: 13 }}>
            Roles ({locationInfo.roles.length}):
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {locationInfo.roles.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>
        </div>
      )}

      {selectedLocationId && locationInfo === null && (
        <p style={{ color: "#999", fontSize: 13 }}>กำลังโหลดข้อมูลสถานที่...</p>
      )}

      {isHost && isAdminHost && (
        <div style={{ margin: "16px 0", padding: 12, border: "1px solid #ccc" }}>
          <label>
            สถานที่ที่จะเล่น (ไม่เลือก = สุ่ม):{" "}
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
          {locations.length === 0 && (
            <p style={{ color: "orange" }}>
              ยังไม่มี location ที่เปิดใช้งานอยู่ ไปเพิ่ม/เปิดที่หน้า Admin ก่อน
            </p>
          )}
        </div>
      )}

      {isHost && (
        <div style={{ margin: "16px 0", padding: 12, border: "1px solid #ccc" }}>
          <label>
            จำนวน Spy:{" "}
            <select
              value={spyCount}
              onChange={(e) => setSpyCount(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} คน
                </option>
              ))}
            </select>
          </label>
          <p style={{ color: "#666", fontSize: 13 }}>
            ถ้ามี Spy มากกว่าครึ่งห้องเกมจะยาก (server กันไว้ไม่ให้เกินผู้เล่น - 1)
          </p>
        </div>
      )}

      {isHost && (
        <div style={{ margin: "16px 0", padding: 12, border: "1px solid #ccc" }}>
          <label>
            จำนวน Joker:{" "}
            <select
              value={jokerCount}
              onChange={(e) => setJokerCount(Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} คน
                </option>
              ))}
            </select>
          </label>
          <p style={{ color: "#666", fontSize: 13 }}>
            Joker เห็นสถานที่เหมือนผู้เล่น แต่ถ้าโดนโหวตออก Joker จะชนะ (ต้องมีคนปกติอย่างน้อย 1 คน)
          </p>
        </div>
      )}

      {isHost && (
        <div style={{ margin: "16px 0", padding: 12, border: "1px solid #ccc" }}>
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
          <p style={{ color: "#666", fontSize: 13 }}>
            ระยะเวลาที่ผู้เล่นมีเวลาค้นหาว่าใครเป็น Spy
          </p>
        </div>
      )}

      {isHost && (
        <div style={{ margin: "16px 0", padding: 12, border: "1px solid #ccc" }}>
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
          <p style={{ color: "#666", fontSize: 13 }}>
            ระยะเวลาที่ผู้เล่นต้องโหวตว่าใครเป็น Spy
          </p>
        </div>
      )}

      {isHost ? (
        <button onClick={handleStart} disabled={starting || playerList.length < 3}>
          {starting ? "กำลังเริ่ม..." : "Start Game"}
        </button>
      ) : (
        <p>รอ host เริ่มเกม...</p>
      )}

      {isHost && playerList.length < 3 && (
        <p>ต้องมีผู้เล่นอย่างน้อย 3 คนถึงจะเริ่มได้</p>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
