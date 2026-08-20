"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, rldb } from "@/app/lib/firebase";
import { useAuth } from "@/app/lib/useAuth";

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const isGoogleUser = !!user && !user.isAnonymous;

  useEffect(() => {
    let cancelled = false;
    if (!loading && isGoogleUser && user) {
      get(ref(rldb, `admins/${user.uid}`))
        .then((snap) => {
          if (!cancelled) setIsAdmin(snap.exists());
        })
        .catch((err) => {
          console.error("admin check error:", err);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [loading, isGoogleUser, user]);

  async function handleGoogleLogin() {
    setBusy(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);

      const current = auth.currentUser;
      if (!current) throw new Error("เข้าสู่ระบบไม่สำเร็จ");

      const adminRef = ref(rldb, `admins/${current.uid}`);
      const adminsSnap = await get(adminRef);
      if (!adminsSnap.exists()) {
        throw new Error("บัญชีนี้ยังไม่ได้รับสิทธิ์ admin");
      }
      setIsAdmin(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setError("");
    setIsAdmin(null);
    await signOut(auth);
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-text-secondary">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-text">Admin</h1>
          <p className="mt-1 text-sm text-text-secondary">
            จัดการ Location และผู้ดูแลระบบ
          </p>
        </div>

        {isGoogleUser && isAdmin ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-text-secondary">
              {user?.email || user?.uid}
            </p>
            <button
              onClick={() => router.push("/admin/locations")}
              className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle"
            >
              จัดการ Location
            </button>
            <button
              onClick={() => router.push("/admin/users")}
              className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle"
            >
              จัดการ Admin
            </button>
            <button
              onClick={handleSignOut}
              className="w-full rounded-[var(--radius-md)] px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:text-danger"
            >
              ออกจากระบบ
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-sm text-text-secondary">
              {isGoogleUser
                ? "ยังไม่พบสิทธิ์ admin กดปุ่มด้านล่างเพื่อสมัคร"
                : "ใช้บัญชี Google เพื่อเข้าใช้งานหน้า admin"}
            </p>
            <button
              onClick={handleGoogleLogin}
              disabled={busy}
              className="w-full rounded-[var(--radius-md)] bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "กำลังตรวจสอบ..." : "Sign in with Google"}
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-[var(--radius-md)] bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="text-center">
          <Link
            href="/"
            className="text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </main>
  );
}
