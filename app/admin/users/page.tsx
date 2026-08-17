"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { get, ref } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth, rldb } from "@/firebase";
import { useAuth } from "@/app/lib/useAuth";
import { listAdmins, addAdmin, removeAdmin, AdminItem } from "@/app/lib/adminFunctions";

// หน้า Admin — จัดการ admin user (เพิ่ม/ถอดสิทธิ์)
//
// หมายเหตุสำคัญ: ปุ่ม "ถอดสิทธิ์" จะลบ record ที่ admins/{uid} (RTDB) เท่านั้น
// ส่วน user ใน Firebase Auth ระบบจะลบให้อัตโนมัติผ่าน trigger adminRemoved
// (ใคร "หลุด" จาก admin -> ลบ user ใน auth ตามไปอัตโนมัติ ไม่ต้องลบมือ)
export default function AdminUsersPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newUid, setNewUid] = useState("");
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);

  // gate หน้าเฉพาะ admin (เหมือนหน้าจัดการ location)
  useEffect(() => {
    if (loading) return;
    if (!user || user.isAnonymous) {
      router.replace("/admin");
      return;
    }

    let cancelled = false;

    get(ref(rldb, `admins/${user.uid}`))
      .then(async (snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          router.replace("/admin");
          return;
        }
        setIsAdmin(true);
        const res = await listAdmins();
        if (!cancelled) setAdmins(res.admins);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("admin check error:", err);
        router.replace("/admin");
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user, router]);

  async function refreshAdmins() {
    const res = await listAdmins();
    setAdmins(res.admins);
  }

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
    const uid = newUid.trim();
    if (!uid) return;
    run(async () => {
      await addAdmin(uid);
      setNewUid("");
      await refreshAdmins();
    });
  }

  function handleRemove(item: AdminItem) {
    run(async () => {
      await removeAdmin(item.uid);
      setConfirmRemoveUid(null);
      await refreshAdmins();
    });
  }

  if (loading || isAdmin === null) return <div>กำลังตรวจสอบสิทธิ์...</div>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Admin — จัดการ Admin</h1>
        <div>
          <Link href="/admin">Admin Home</Link>
          {" | "}
          <Link href="/">หน้าแรก</Link>
          {" | "}
          <button onClick={() => signOut(auth)}>ออกจากระบบ</button>
        </div>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <section style={{ marginTop: 24, border: "1px solid #ccc", padding: 16 }}>
        <h2>เพิ่ม Admin ใหม่</h2>
        <p>
          ใส่ uid ของคนที่จะให้สิทธิ์ - คนนั้นต้องเคย login (Google) ผ่าน Firebase มาก่อน
          ถึงจะมี record ใน Firebase Auth
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newUid}
            onChange={(e) => setNewUid(e.target.value)}
            placeholder="uid (จาก Firebase Auth)"
            style={{ flex: 1 }}
          />
          <button onClick={handleAdd} disabled={busy || newUid.trim().length === 0}>
            {busy ? "กำลังบันทึก..." : "เพิ่ม Admin"}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Admin ทั้งหมด ({admins.length})</h2>
        {admins.length === 0 && <p>ยังไม่มี admin ในระบบ</p>}
        {admins.map((item) => (
          <div
            key={item.uid}
            style={{ border: "1px solid #ccc", padding: 12, marginBottom: 12 }}
          >
            <div>
              <strong>{item.displayName || item.email || "ไม่มีชื่อ"}</strong>
              {item.uid === user?.uid && " (คุณ)"}
            </div>
            {item.email && <p>email: {item.email}</p>}
            <p>uid: {item.uid}</p>

            {item.uid === user?.uid ? (
              <p style={{ color: "#888" }}>ลบตัวเองไม่ได้ (กัน lock out)</p>
            ) : confirmRemoveUid === item.uid ? (
              <p>
                ยืนยันถอดสิทธิ์?{" "}
                <span style={{ color: "red" }}>
                  ระบบจะลบ user ใน Firebase Auth ให้อัตโนมัติ (login กลับไม่ได้อีก)
                </span>{" "}
                <button onClick={() => handleRemove(item)} disabled={busy}>
                  ใช่ ถอดสิทธิ์เลย
                </button>{" "}
                <button onClick={() => setConfirmRemoveUid(null)} disabled={busy}>
                  ยกเลิก
                </button>
              </p>
            ) : (
              <button onClick={() => setConfirmRemoveUid(item.uid)} disabled={busy}>
                ถอดสิทธิ์
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
