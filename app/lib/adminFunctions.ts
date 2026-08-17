import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// client wrapper สำหรับ function ฝั่ง admin
// backend จะเช็คสิทธิ์ admin (admins/{uid}) เองเสมอ ไม่เชื่อ client

// ---------- Location ----------

export async function addLocation(input: { name: string; roles: string[] }) {
  const fn = httpsCallable(functions, "addLocation");
  const res = await fn(input);
  return res.data as { ok: true; locationId: string };
}

export async function updateLocation(input: {
  locationId: string;
  name: string;
  roles: string[];
}) {
  const fn = httpsCallable(functions, "updateLocation");
  const res = await fn(input);
  return res.data as { ok: true };
}

export async function toggleLocationActive(locationId: string) {
  const fn = httpsCallable(functions, "toggleLocationActive");
  const res = await fn({ locationId });
  return res.data as { ok: true; active: boolean };
}

// ลบ location แบบถาวร (ระวัง: ใช้เมื่อแน่ใจว่าไม่มีห้องไหนอ้างอิงอยู่)
export async function deleteLocation(locationId: string) {
  const fn = httpsCallable(functions, "deleteLocation");
  const res = await fn({ locationId });
  return res.data as { ok: true };
}

// เติม location พื้นฐานจากระบบเก่า (ข้ามตัวที่ชื่อซ้ำ)
export async function seedLocations() {
  const fn = httpsCallable(functions, "seedLocations");
  const res = await fn({});
  return res.data as { ok: true; added: number };
}

// ---------- Admin user ----------

export type AdminItem = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  addedAt?: number;
  addedBy?: string;
};

export async function listAdmins() {
  const fn = httpsCallable(functions, "listAdmins");
  const res = await fn({});
  return res.data as { admins: AdminItem[] };
}

export async function addAdmin(uid: string) {
  const fn = httpsCallable(functions, "addAdmin");
  const res = await fn({ uid });
  return res.data as { ok: true };
}

// ถอดสิทธิ์ admin + ลบ user ใน Firebase Auth ด้วย
export async function removeAdmin(uid: string) {
  const fn = httpsCallable(functions, "removeAdmin");
  const res = await fn({ uid });
  return res.data as { ok: true };
}
