import {
  initializeApp,
  cert,
  getApps,
  getApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";
import { getAuth, type Auth } from "firebase-admin/auth";

let cachedApp: App | undefined;
let cachedDb: Database | undefined;
let cachedAuth: Auth | undefined;

function parseServiceAccount(): ServiceAccount {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

  if (serviceAccount) {
    try {
      return JSON.parse(serviceAccount) as ServiceAccount;
    } catch {
      try {
        return JSON.parse(Buffer.from(serviceAccount, "base64").toString("utf8")) as ServiceAccount;
      } catch {
        throw new Error(
          "FIREBASE_SERVICE_ACCOUNT_KEY must be a single-line JSON string or base64-encoded JSON. " +
            "Do not paste the service account JSON as unquoted multiple lines in .env.",
        );
      }
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  throw new Error(
    "Firebase Admin credentials are required for production. Set FIREBASE_SERVICE_ACCOUNT_KEY " +
      "or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
  );
}

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

  return initializeApp({
    credential: cert(parseServiceAccount()),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

function getFirebaseAdminApp() {
  cachedApp ??= initFirebaseAdmin();
  return cachedApp;
}

export function getAdminDb() {
  cachedDb ??= getDatabase(getFirebaseAdminApp());
  return cachedDb;
}

export function getAdminAuth() {
  cachedAuth ??= getAuth(getFirebaseAdminApp());
  return cachedAuth;
}

function lazyFirebaseAdmin<T extends object>(factory: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = factory();
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const adminDb = lazyFirebaseAdmin(getAdminDb);
export const adminAuth = lazyFirebaseAdmin(getAdminAuth);
