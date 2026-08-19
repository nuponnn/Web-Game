import { NextRequest } from "next/server";
import { adminAuth } from "./firebaseAdmin";
import { ApiError } from "./errors";

export interface AuthContext {
  uid: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(payload);
}

export async function verifyAuth(req: NextRequest): Promise<AuthContext> {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError("unauthenticated", "Missing or invalid Authorization header");
  }

  const token = header.slice(7);

  if (process.env.NODE_ENV === "development") {
    try {
      const payload = decodeJwtPayload(token);
      const uid = payload.user_id || payload.sub;
      if (typeof uid !== "string" || !uid) {
        throw new ApiError("unauthenticated", "Invalid token: no uid found");
      }
      return { uid };
    } catch {
      throw new ApiError("unauthenticated", "Invalid token");
    }
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    throw new ApiError("unauthenticated", "Invalid or expired token");
  }
}
