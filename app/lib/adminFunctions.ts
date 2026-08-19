import { auth } from "./firebase";

async function apiCall<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `API error ${res.status}`);
  }
  return data as T;
}

// ---------- Location ----------

export async function addLocation(input: { name: string; roles: string[] }) {
  return apiCall<{ ok: true; locationId: string }>("/api/locations/addLocation", input);
}

export async function updateLocation(input: {
  locationId: string;
  name: string;
  roles: string[];
}) {
  return apiCall<{ ok: true }>("/api/locations/updateLocation", input);
}

export async function toggleLocationActive(locationId: string) {
  return apiCall<{ ok: true; active: boolean }>("/api/locations/toggleLocationActive", { locationId });
}

export async function deleteLocation(locationId: string) {
  return apiCall<{ ok: true }>("/api/locations/deleteLocation", { locationId });
}

export async function seedLocations() {
  return apiCall<{ ok: true; added: number }>("/api/locations/seedLocations", {});
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
  return apiCall<{ admins: AdminItem[] }>("/api/admins/listAdmins", {});
}

export async function addAdmin(uid: string) {
  return apiCall<{ ok: true }>("/api/admins/addAdmin", { uid });
}

export async function removeAdmin(uid: string) {
  return apiCall<{ ok: true }>("/api/admins/removeAdmin", { uid });
}
