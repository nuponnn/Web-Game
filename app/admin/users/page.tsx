"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { get, ref } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth, rldb } from "@/app/lib/firebase";
import { useAuth } from "@/app/lib/useAuth";
import { listAdmins, addAdmin, removeAdmin, AdminItem } from "@/app/lib/adminFunctions";

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newUid, setNewUid] = useState("");
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);

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

  if (loading || isAdmin === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-text-secondary">กำลังตรวจสอบสิทธิ์...</p>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold text-text">Admin Users</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-xs text-text-muted transition-colors hover:text-text-secondary"
            >
              Admin
            </Link>
            <Link
              href="/"
              className="text-xs text-text-muted transition-colors hover:text-text-secondary"
            >
              หน้าแรก
            </Link>
            <button
              onClick={() => signOut(auth)}
              className="text-xs text-text-muted transition-colors hover:text-danger"
            >
              ออก
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-[var(--radius-md)] bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Add Form */}
        <div className="mb-6 space-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            เพิ่ม Admin ใหม่
          </p>
          <p className="text-xs text-text-muted">
            ใส่ uid ของคนที่จะให้สิทธิ์ (ต้องเคย login Google ผ่าน Firebase มาก่อน)
          </p>
          <div className="flex gap-2">
            <input
              value={newUid}
              onChange={(e) => setNewUid(e.target.value)}
              placeholder="uid"
              className="flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
            />
            <button
              onClick={handleAdd}
              disabled={busy || newUid.trim().length === 0}
              className="rounded-[var(--radius-md)] bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "..." : "เพิ่ม"}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary">
            ทั้งหมด {admins.length} admins
          </p>
          {admins.length === 0 && (
            <p className="text-sm text-text-muted">ยังไม่มี admin</p>
          )}
          {admins.map((item) => (
            <div
              key={item.uid}
              className="rounded-[var(--radius-md)] border border-border bg-surface p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-text">
                    {item.displayName || item.email || "ไม่มีชื่อ"}
                  </span>
                  {item.uid === user?.uid && (
                    <span className="ml-1.5 text-[10px] text-text-muted">
                      (คุณ)
                    </span>
                  )}
                </div>
              </div>
              {item.email && (
                <p className="mt-1 text-xs text-text-muted">{item.email}</p>
              )}
              <p className="mt-0.5 font-mono text-[10px] text-text-muted">
                {item.uid}
              </p>

              {item.uid === user?.uid ? (
                <p className="mt-2 text-[11px] text-text-muted">
                  ลบตัวเองไม่ได้
                </p>
              ) : confirmRemoveUid === item.uid ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-danger">
                    ยืนยันถอดสิทธิ์? จะลบ user ใน Auth ด้วย
                  </span>
                  <button
                    onClick={() => handleRemove(item)}
                    disabled={busy}
                    className="rounded-[var(--radius-sm)] bg-danger px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
                  >
                    ใช่
                  </button>
                  <button
                    onClick={() => setConfirmRemoveUid(null)}
                    disabled={busy}
                    className="rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-[11px] font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemoveUid(item.uid)}
                  disabled={busy}
                  className="mt-2 rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-medium text-text-muted transition-colors hover:text-danger disabled:opacity-50"
                >
                  ถอดสิทธิ์
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
