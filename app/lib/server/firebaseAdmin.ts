import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

function initFirebaseAdmin() {
  if (getApps().length > 0) return getApp();

  const isEmulator =
    !!process.env.FIREBASE_DATABASE_EMULATOR_HOST ||
    process.env.NODE_ENV === "development";

  if (isEmulator) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
    process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= "127.0.0.1:9000";
    const app = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-web-game-3bab8",
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    });
    return app;
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccount) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY env var is required for production. " +
        "Generate from Firebase Console > Project Settings > Service Accounts.",
    );
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccount)),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

const app = initFirebaseAdmin();

export const adminDb = getDatabase(app);
export const adminAuth = getAuth(app);
