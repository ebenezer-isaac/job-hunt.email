'use client';

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { clientEnv } from "@/lib/env-client";

const firebaseConfig = {
  apiKey: clientEnv.firebaseApiKey,
  authDomain: clientEnv.firebaseAuthDomain,
  projectId: clientEnv.firebaseProjectId,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const firebaseApp = app;
export const firebaseAuth = getAuth(app);
