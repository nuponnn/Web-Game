"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onValue, ref, get } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth, rldb } from "@/app/lib/firebase";
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

const MIN_ROLES = 7;

function filledRoles(roles: string[]): string[] {
  return roles.map((r) => r.trim()).filter((r) => r.length > 0);
}

function RoleFields({
  roles,
  onChange,
}: {
  roles: string[];
  onChange: (next: string[]) => void;
}) {
  const count = filledRoles(roles).length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-secondary">
        บทบาท ({count} / อย่างน้อย {MIN_ROLES})
      </p>
      <div className="space-y-1.5">
        {roles.map((role, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              value={role}
              onChange={(e) => {
                const next = [...roles];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={`บทบาทที่ ${i + 1}`}
              className="flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={() => onChange(roles.filter((_, j) => j !== i))}
              className="rounded-[var(--radius-sm)] px-2 text-xs text-text-muted transition-colors hover:text-danger"
            >
              x
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...roles, ""])}
        className="text-xs font-medium text-accent transition-colors hover:text-accent-hover"
      >
        + เพิ่มบทบาท
      </button>
      {count < MIN_ROLES && (
        <p className="text-xs text-warning">
          ยังไม่ครบขั้นต่ำ {MIN_ROLES} roles
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

  const [newName, setNewName] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>([""]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([""]);

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
            setError("อ่าน location ไม่สำเร็จ");
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
      setNewName("");
      setNewRoles([""]);
    });
  }

  function handleToggle(item: LocationItem) {
    run(() => toggleLocationActive(item.id));
  }

  function handleDelete(item: LocationItem) {
    run(async () => {
      await deleteLocation(item.id);
      setConfirmDeleteId(null);
    });
  }

  function handleSeed() {
    setSeedMsg("");
    run(async () => {
      const res = await seedLocations();
      setSeedMsg(`เพิ่ม ${res.added}  location สำเร็จ`);
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

  if (loading || isAdmin === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-text-secondary">กำลังตรวจสอบสิทธิ์...</p>
      </div>
    );
  }

  const addReady = newName.trim().length > 0 && filledRoles(newRoles).length >= MIN_ROLES;

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold text-text">Locations</h1>
          <div className="flex items-center gap-3">
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

        {/* Seed */}
        <div className="mb-6 flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={busy}
            className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-50"
          >
            Seed defaults
          </button>
          {seedMsg && <span className="text-xs text-success">{seedMsg}</span>}
        </div>

        {/* Add Form */}
        <div className="mb-6 space-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            เพิ่ม Location ใหม่
          </p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อสถานที่ เช่น โรงพยาบาล"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
          <RoleFields roles={newRoles} onChange={setNewRoles} />
          <button
            onClick={handleAdd}
            disabled={busy || !addReady}
            className="w-full rounded-[var(--radius-md)] bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก..." : "เพิ่ม Location"}
          </button>
        </div>

        {/* List */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary">
            ทั้งหมด {locations.length} locations
          </p>
          {locations.length === 0 && (
            <p className="text-sm text-text-muted">ยังไม่มี location</p>
          )}
          {locations.map((item) => (
            <div
              key={item.id}
              className="rounded-[var(--radius-md)] border border-border bg-surface p-4"
            >
              {editingId === item.id ? (
                <div className="space-y-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="ชื่อสถานที่"
                    className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                  />
                  <RoleFields roles={editRoles} onChange={setEditRoles} />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={busy || editName.trim().length === 0 || filledRoles(editRoles).length < MIN_ROLES}
                      className="rounded-[var(--radius-sm)] bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      บันทึก
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={busy}
                      className="rounded-[var(--radius-sm)] border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text">
                        {item.name}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          item.active ? "text-success" : "text-danger"
                        }`}
                      >
                        {item.active ? "active" : "inactive"}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted">
                    {item.roles.length} roles: {item.roles.slice(0, 5).join(", ")}
                    {item.roles.length > 5 ? ` +${item.roles.length - 5}` : ""}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={busy}
                      className="rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-[11px] font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-50"
                    >
                      {item.active ? "ปิด" : "เปิด"}
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      disabled={busy}
                      className="rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-[11px] font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-50"
                    >
                      แก้ไข
                    </button>
                    {confirmDeleteId === item.id ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={busy}
                          className="rounded-[var(--radius-sm)] bg-danger px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-danger-hover disabled:opacity-50"
                        >
                          ลบเลย
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={busy}
                          className="rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-[11px] font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(item.id)}
                        disabled={busy}
                        className="rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-medium text-text-muted transition-colors hover:text-danger disabled:opacity-50"
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
