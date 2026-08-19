import { ApiError } from "./errors";
import { MIN_ROLES, MAX_PLAYERS } from "./constants";

// โครงสร้าง location ที่ใช้ในระบบ (ตอนนี้อ่านจาก database ไม่ใช่ static file)
export interface LocationDef {
  name: string;
  roles: string[]; // role สำหรับคนที่ไม่ใช่สปาย
}

// โครงสร้าง document จริงที่เก็บใน locations/{locationId}
export interface LocationDoc extends LocationDef {
  active: boolean;
  createdAt?: number;
  createdBy?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// สุ่ม role จาก location โดยพยายามไม่ให้ซ้ำกันถ้าจำนวนคนไม่เกินจำนวน role ที่มี
export function assignRoles(location: LocationDef, playerCount: number): string[] {
  const pool = [...location.roles];
  const result: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    if (pool.length === 0) {
      // ถ้าคนเยอะกว่า role ที่มี ให้สุ่มซ้ำได้จาก roles เดิม
      result.push(location.roles[randomInt(location.roles.length)]);
    } else {
      const idx = randomInt(pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
  }
  return result;
}

// ตรวจ + ทำความสะอาด input (name/roles) ก่อนเขียน database
// ใช้ร่วมกับ addLocation และ updateLocation เพื่อไม่ให้ข้อมูลพัง
// กติกาตาม plan:
//  - roles ต้อง >= MIN_ROLES (MAX_PLAYERS - 1) เพราะ spy ไม่ต้องมี role
//  - roles ห้ามมีชื่อซ้ำกันเอง
//  - name ห้ามว่าง / ยาวเกิน
export function cleanAndValidateLocation(input: {
  name: unknown;
  roles: unknown;
}): LocationDef {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    throw new ApiError("invalid-argument", "ต้องระบุชื่อสถานที่");
  }
  if (name.length > 50) {
    throw new ApiError("invalid-argument", "ชื่อสถานที่ยาวเกินไป (ไม่เกิน 50 ตัวอักษร)");
  }

  if (!Array.isArray(input.roles)) {
    throw new ApiError("invalid-argument", "ต้องระบุ roles เป็น array");
  }

  const roles = input.roles.map((r) => (typeof r === "string" ? r.trim() : ""));
  if (roles.some((r) => r.length === 0)) {
    throw new ApiError("invalid-argument", "ห้ามมี role ที่ว่างเปล่า");
  }
  if (roles.length < MIN_ROLES) {
    throw new ApiError(
      "invalid-argument",
      `ต้องมีอย่างน้อย ${MIN_ROLES} roles (ผู้เล่นปกติสูงสุด ${MAX_PLAYERS - 1} คน)`,
    );
  }
  const lower = new Set(roles.map((r) => r.toLowerCase()));
  if (lower.size !== roles.length) {
    throw new ApiError("invalid-argument", "ห้ามมี role ชื่อซ้ำกัน");
  }

  return { name, roles };
}
