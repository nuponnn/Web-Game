"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  type Auth,
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

// Singleton pattern ป้องกันการรัน initializeApp ซ้ำ
const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let auth: Auth;

if (typeof window !== "undefined") {
  try {
    auth = initializeAuth(app, {
      persistence: browserSessionPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    auth = getAuth(app);
  }
} else {
  auth = getAuth(app);
}

const rldb: Database = getDatabase(app);

if (typeof window !== "undefined") {
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocalhost) {
    // 🖥️ ถ้าทำงานบนเครื่องเรา -> ต่อเข้า Emulator
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectDatabaseEmulator(rldb, "127.0.0.1", 9000);
    console.log("⚡ Connected to Firebase Emulator Suite");
  } else {
    // ✅ Analytics เปิดแค่ production จริง บน browser เท่านั้น
    import("firebase/analytics").then(({ getAnalytics, isSupported }) => {
      isSupported().then((supported) => {
        if (supported) getAnalytics(app);
      });
    });
  }
}

export { app, auth, rldb };
