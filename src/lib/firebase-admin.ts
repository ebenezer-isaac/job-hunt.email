import { env } from "@/env";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth, type Auth } from "firebase-admin/auth";
import type { Bucket } from "@google-cloud/storage";
import { createDebugLogger } from "@/lib/debug-logger";

let app: App | null = null;
let firestore: Firestore | null = null;
let bucket: Bucket | null = null;
let authClient: Auth | null = null;

const firebaseAdminLogger = createDebugLogger("firebase-admin");
firebaseAdminLogger.step("Setting up Firebase admin helpers");

function getFirebaseApp(): App {
  firebaseAdminLogger.step("Fetching Firebase admin app instance");
  if (app) {
    firebaseAdminLogger.step("Returning memoized Firebase admin app", { appName: app.name });
    return app;
  }

  if (getApps().length > 0) {
    app = getApps()[0] as App;
    firebaseAdminLogger.step("Using existing Firebase admin app", { appName: app.name });
    return app;
  }

  const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
  firebaseAdminLogger.data("firebase-admin-private-key", { length: privateKey.length });

  app = initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });

  firebaseAdminLogger.step("Initialized new Firebase admin app", {
    projectId: env.FIREBASE_PROJECT_ID,
    bucket: env.FIREBASE_STORAGE_BUCKET,
  });

  return app;
}

export function getDb(): Firestore {
  firebaseAdminLogger.step("Requesting Firestore instance");
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp());
    firebaseAdminLogger.step("Created Firestore instance", { projectId: env.FIREBASE_PROJECT_ID });
  }
  return firestore;
}

export function getStorageBucket(): Bucket {
  firebaseAdminLogger.step("Requesting Storage bucket instance");
  if (!bucket) {
    bucket = getStorage(getFirebaseApp()).bucket(env.FIREBASE_STORAGE_BUCKET);
    firebaseAdminLogger.step("Created Storage bucket handle", { bucketName: bucket.name });
  }
  return bucket;
}

export function getAuthClient(): Auth {
  firebaseAdminLogger.step("Requesting Firebase auth client");
  if (!authClient) {
    authClient = getAuth(getFirebaseApp());
    firebaseAdminLogger.step("Created Firebase auth client");
  }
  return authClient;
}
