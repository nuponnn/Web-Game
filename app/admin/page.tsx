"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { get, ref, set, update } from "firebase/database";
import { auth, rldb } from "@/app/lib/firebase";
import { useAuth } from "@/app/lib/useAuth";

// หน้า Admin Login - แยกจาก flow ผู้เล่น (anonymous)
//
// ผู้เล่นทั่วไปยังใช้ Anonymous Auth เหมือนเดิม แต่ admin ต้อง Sign-In ด้วย Google
// ใครก็ได้ที่ login ด้วย Google จะได้สิทธิ์ admin ทันที (ระบบเขียน admins/{uid}
// ของตัวเองให้เอง ไม่ต้องขออนุญาต / ไม่ต้องเพิ่มจาก Console)
//
// หมายเหตุ: ต้องเปิด Google Sign-In ใน Firebase Console (Authentication -> Sign-in method)
// และตอนใช้งาน Emulator popup จะทำงานไม่ได้ ต้อง sign-in ผ่าน Emulator UI แทน
export default function AdminLoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const isGoogleUser = !!user && !user.isAnonymous;

  // ถ้ามี Google user อยู่แล้ว (เช่น reload หน้า) ให้เช็คสิทธิ์ admin ทันที
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
      // signInWithPopup จะแทนที่ session anonymous ที่ AuthProvider สร้างไว้
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);

      const current = auth.currentUser;
      if (!current) throw new Error("เข้าสู่ระบบไม่สำเร็จ");

      // สมัครเป็น admin เองทันที: ใคร login มาด้วย Google ก็ได้สิทธิ์ได้เลย
      // (rules เปิดให้เขียน admins/{uid} ของตัวเองได้)
      const adminRef = ref(rldb, `admins/${current.uid}`);
      const adminsSnap = await get(adminRef);
      if (adminsSnap.exists()) {
        await update(adminRef, {
          email: current.email ?? null,
          displayName: current.displayName ?? null,
        });
      } else {
        await set(adminRef, {
          email: current.email ?? null,
          displayName: current.displayName ?? null,
          addedAt: Date.now(),
          addedBy: current.uid, // สมัครเอง
        });
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

  if (loading) return <div>กำลังโหลด...</div>;

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
      <h1>Admin Login</h1>
      <p>จัดการระบบ (Location / ผู้ดูแลระบบ)</p>

      {isGoogleUser && isAdmin ? (
        <div>
          <p>
            กำลัง login ด้วย: {user?.email || user?.uid}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => router.push("/admin/locations")}>
              จัดการ Location
            </button>
            <button onClick={() => router.push("/admin/users")}>
              จัดการ Admin (เพิ่ม/ลบ user)
            </button>
            <button onClick={handleSignOut}>ออกจากระบบ</button>
          </div>
        </div>
      ) : (
        <div>
          {isGoogleUser ? (
            <p>ยังไม่พบสิทธิ์ admin กดปุ่มด้านล่างเพื่อสมัคร (ยืนยันสิทธิ์) ได้ทันที</p>
          ) : (
            <p>
              ใช้บัญชี Google เพื่อเข้าใช้งานหน้า admin
              (ใคร login ก็ได้สิทธิ์ admin ได้ทันที ไม่ต้องขออนุญาต)
            </p>
          )}
          <button onClick={handleGoogleLogin} disabled={busy}>
            {busy ? "กำลังตรวจสอบ..." : "Sign in with Google"}
          </button>
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
      <p>
        <Link href="/">กลับหน้าแรก</Link>
      </p>
    </div>
  );
}
