import { apiRequest } from "./apiRequest";

// ---------- Location ----------

export async function addLocation(input: { name: string; roles: string[] }) {
  return apiRequest<{ ok: true; locationId: string }>("/api/locations/addLocation", input);
}

export async function updateLocation(input: {
  locationId: string;
  name: string;
  roles: string[];
}) {
  return apiRequest<{ ok: true }>("/api/locations/updateLocation", input);
}

export async function toggleLocationActive(locationId: string) {
  return apiRequest<{ ok: true; active: boolean }>("/api/locations/toggleLocationActive", { locationId });
}

export async function deleteLocation(locationId: string) {
  return apiRequest<{ ok: true }>("/api/locations/deleteLocation", { locationId });
}

export async function seedLocations() {
  return apiRequest<{ ok: true; added: number }>("/api/locations/seedLocations", {});
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
  return apiRequest<{ admins: AdminItem[] }>("/api/admins/listAdmins", {});
}

export async function addAdmin(uid: string) {
  return apiRequest<{ ok: true }>("/api/admins/addAdmin", { uid });
}

export async function removeAdmin(uid: string) {
  return apiRequest<{ ok: true }>("/api/admins/removeAdmin", { uid });
}
