"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onValue, ref, get } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth, rldb } from "@/firebase";
import { useAuth } from "@/app/lib/useAuth";
import {
  addLocation,
  updateLocation,
  toggleLocationActive,
  deleteLocation,
  seedLocations,
} from "@/app/lib/adminFunctions";

type LocationItem = {
  id: string;
  name: string;
  roles: string[];
  active: boolean;
  createdAt?: number;
  createdBy?: string;
};

// ต้องตรงกับ backend: MIN_ROLES = MAX_PLAYERS(8) - 1 = 7
// ใช้เตือนแบบ realtime ก่อนกด submit เพื่อกันส่ง request ที่ backend จะ reject อยู่ดี
const MIN_ROLES = 7;

// แปลงรายการ roles (รวมช่องว่าง) เป็น array ที่กรอกจริงแล้ว
function filledRoles(roles: string[]): string[] {
  return roles.map((r) => r.trim()).filter((r) => r.length > 0);
}

// ฟอร์มกรอกชื่อ + roles แบบ dynamic list (ใช้ทั้งตอนเพิ่มและแก้ไข)
function RoleFields({
  roles,
  onChange,
}: {
  roles: string[];
  onChange: (next: string[]) => void;
}) {
  const count = filledRoles(roles).length;
  return (
    <div>
      <p>
        บทบาท ({count} / อย่างน้อย {MIN_ROLES}):
      </p>
      {roles.map((role, i) => (
        <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          <input
            value={role}
            onChange={(e) => {
              const next = [...roles];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`บทบาทที่ ${i + 1}`}
            style={{ flex: 1 }}
          />
          <button type="button" onClick={() => onChange(roles.filter((_, j) => j !== i))}>
            ลบ
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...roles, ""])}>
        + เพิ่มบทบาท
      </button>
      {count < MIN_ROLES && (
        <p style={{ color: "orange" }}>
          ยังไม่ครบขั้นต่ำ {MIN_ROLES} roles (ต้องมากพอให้ผู้เล่นปกติทุกคนได้ role ไม่ซ้ำ)
        </p>
      )}
    </div>
  );
}

export default function AdminLocationsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState("");

  // form เพิ่ม location ใหม่
  const [newName, setNewName] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>([""]);

  // form แก้ไข location
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([""]);

  // 1) กันหน้าเข้าได้เฉพาะ admin จริงๆ (user ที่เป็น Google + อยู่ใน admins/{uid})
  //    เช็คผ่าน security rules เป็นหลัก แต่หน้านี้ทำ gate ไว้ให้ user เห็น UI ก่อนใช้ callable
  useEffect(() => {
    if (loading) return;
    if (!user || user.isAnonymous) {
      router.replace("/admin");
      return;
    }

    let cancelled = false;
    let unsub: (() => void) | null = null;

    get(ref(rldb, `admins/${user.uid}`))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          router.replace("/admin");
          return;
        }
        setIsAdmin(true);

        // 2) subscribe ทั้ง locations list เพื่อโชว์แบบ realtime
        unsub = onValue(
          ref(rldb, "locations"),
          (locationsSnap) => {
            const val = locationsSnap.val() as
              | Record<string, Omit<LocationItem, "id">>
              | null;
            const list = Object.entries(val || {}).map(([id, loc]) => ({
              id,
              ...loc,
            }));
            list.sort((a, b) => (a.name < b.name ? -1 : 1));
            setLocations(list);
          },
          (err) => {
            console.error("subscribe locations error:", err);
            setError("อ่าน location ไม่สำเร็จ (เช็ค security rules)");
          }
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("admin check error:", err);
        router.replace("/admin");
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [loading, user, router]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function handleAdd() {
    const roles = filledRoles(newRoles);
    run(async () => {
      await addLocation({ name: newName.trim(), roles });
      // reset form ให้พร้อมเพิ่มตัวถัดไป
      setNewName("");
      setNewRoles([""]);
    });
  }

  function handleToggle(item: LocationItem) {
    run(() => toggleLocationActive(item.id));
  }

  function handleDelete(item: LocationItem) {
    // ลบจริงแบบถาวร (แนะนำให้ปิดก่อนถ้ายังไม่แน่ใจ)
    run(async () => {
      await deleteLocation(item.id);
      setConfirmDeleteId(null);
    });
  }

  function handleSeed() {
    setSeedMsg("");
    run(async () => {
      const res = await seedLocations();
      setSeedMsg(`เพิ่ม location พื้นฐานสำเร็จ ${res.added} ตัว (ตัวที่ซ้ำกันข้ามไป)`);
    });
  }

  function startEdit(item: LocationItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditRoles(item.roles.length ? [...item.roles] : [""]);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditRoles([""]);
  }

  function handleSaveEdit() {
    if (!editingId) return;
    const roles = filledRoles(editRoles);
    run(() =>
      updateLocation({ locationId: editingId, name: editName.trim(), roles }).then(() =>
        cancelEdit()
      )
    );
  }

  if (loading || isAdmin === null) return <div>กำลังตรวจสอบสิทธิ์...</div>;

  const addReady = newName.trim().length > 0 && filledRoles(newRoles).length >= MIN_ROLES;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Admin — จัดการ Location</h1>
        <div>
          <Link href="/">หน้าแรก</Link>
          {" | "}
          <button onClick={() => signOut(auth)}>ออกจากระบบ</button>
        </div>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ marginTop: 8 }}>
        <button onClick={handleSeed} disabled={busy}>
          Seed ข้อมูลพื้นฐาน (จากระบบเดิม)
        </button>
        {seedMsg && <span style={{ marginLeft: 8 }}>{seedMsg}</span>}
      </div>

      <section style={{ marginTop: 24, border: "1px solid #ccc", padding: 16 }}>
        <h2>เพิ่ม Location ใหม่</h2>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="ชื่อสถานที่ เช่น โรงพยาบาล"
          style={{ marginBottom: 8, display: "block", width: "100%" }}
        />
        <RoleFields roles={newRoles} onChange={setNewRoles} />
        <button onClick={handleAdd} disabled={busy || !addReady}>
          {busy ? "กำลังบันทึก..." : "เพิ่ม Location"}
        </button>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Location ทั้งหมด ({locations.length})</h2>
        {locations.length === 0 && <p>ยังไม่มี location ในระบบ</p>}
        {locations.map((item) => (
          <div
            key={item.id}
            style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12 }}
          >
            {editingId === item.id ? (
              <div>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="ชื่อสถานที่"
                  style={{ marginBottom: 8, display: "block", width: "100%" }}
                />
                <RoleFields roles={editRoles} onChange={setEditRoles} />
                <button
                  onClick={handleSaveEdit}
                  disabled={busy || editName.trim().length === 0 || filledRoles(editRoles).length < MIN_ROLES}
                >
                  บันทึก
                </button>
                <button onClick={cancelEdit} disabled={busy}>
                  ยกเลิก
                </button>
              </div>
            ) : (
              <div>
                <div>
                  <strong>{item.name}</strong>{" "}
                  <span style={{ color: item.active ? "green" : "red" }}>
                    {item.active ? "ใช้งานอยู่" : "ปิดอยู่"}
                  </span>
                </div>
                <p>roles ({item.roles.length}): {item.roles.join(", ")}</p>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => handleToggle(item)} disabled={busy}>
                    {item.active ? "ปิดการใช้งาน" : "เปิดการใช้งาน"}
                  </button>
                  <button onClick={() => startEdit(item)} disabled={busy}>
                    แก้ไข
                  </button>
                  {confirmDeleteId === item.id ? (
                    <span>
                      ยืนยันลบถาวร?{" "}
                      <button onClick={() => handleDelete(item)} disabled={busy}>
                        ใช่ ลบเลย
                      </button>{" "}
                      <button onClick={() => setConfirmDeleteId(null)} disabled={busy}>
                        ยกเลิก
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(item.id)} disabled={busy}>
                      ลบ
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
