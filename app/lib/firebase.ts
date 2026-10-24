"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";

// Singleton ป้องกัน initializeApp ซ้ำ
const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let auth: Auth;

if (typeof window !== "undefined") {
  try {
    auth = initializeAuth(app, {
      // emulator: แยกตามแท็บ (1 แท็บ = 1 anonymous user)
      // production: จำข้ามแท็บ/ปิดเปิด browser
      persistence: useEmulator ? browserSessionPersistence : browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    auth = getAuth(app);
  }
} else {
  auth = getAuth(app);
}

const rldb: Database = getDatabase(app);

// กัน connect emulator ซ้ำตอน HMR
const g = globalThis as unknown as { __emulatorsConnected?: boolean };

if (typeof window !== "undefined") {
  if (useEmulator) {
    if (!g.__emulatorsConnected) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectDatabaseEmulator(rldb, "127.0.0.1", 9000);
      g.__emulatorsConnected = true;
      console.log("⚡ Connected to Firebase Emulator Suite");
    }
  } else {
    import("firebase/analytics").then(({ getAnalytics, isSupported }) => {
      isSupported().then((s) => s && getAnalytics(app));
    });
  }
}

// รอให้ Firebase โหลด session เสร็จก่อน แล้วค่อย sign in ถ้ายังไม่มี user
export function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      try {
        resolve(user ?? (await signInAnonymously(auth)).user);
      } catch (e) {
        reject(e);
      }
    });
  });
}

export { app, auth, rldb };