'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, getFirestore, onSnapshot, type DocumentData } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase-client";
import { createDebugLogger } from "@/lib/debug-logger";
import { useSessionStore } from "@/store/session-store";

export type ClientQuotaSnapshot = {
  totalAllocated: number;
  remaining: number;
  onHold: number;
};

const quotaLogger = createDebugLogger("useQuota");

const QuotaContext = createContext<ClientQuotaSnapshot | null>(null);

type QuotaProviderProps = {
  userId: string | null;
  initialQuota: ClientQuotaSnapshot | null;
  children: ReactNode;
};

export function QuotaProvider({ userId, initialQuota, children }: QuotaProviderProps) {
  const [quota, setQuota] = useState<ClientQuotaSnapshot | null>(initialQuota);
  const setStoreQuota = useSessionStore((state) => state.actions.setQuota);

  useEffect(() => {
    setStoreQuota(initialQuota ?? null);
  }, [initialQuota, setStoreQuota]);

  useEffect(() => {
    if (!userId) {
      setQuota(null);
      setStoreQuota(null);
      return undefined;
    }
    const db = getFirestore(firebaseApp);
    const ref = doc(db, "userProfiles", userId);
    quotaLogger.step("Subscribing to quota document", { userId });
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.exists()) {
          quotaLogger.warn("Quota document missing", { userId });
          return;
        }
        const data = snapshot.data() as DocumentData;
        const quotaData = (data?.quota ?? {}) as Record<string, unknown>;
        const next: ClientQuotaSnapshot = {
          totalAllocated: Number(quotaData.totalAllocated ?? 0),
          remaining: Number(quotaData.remaining ?? 0),
          onHold: Number(quotaData.onHold ?? 0),
        };
        setQuota(next);
        setStoreQuota(next);
      },
      (error) => {
        quotaLogger.error("Quota snapshot error", {
          userId,
          message: error.message,
        });
      },
    );
    return () => {
      quotaLogger.step("Unsubscribing from quota document", { userId });
      unsubscribe();
    };
  }, [userId, setStoreQuota]);

  const value = useMemo(() => quota, [quota]);

  return <QuotaContext.Provider value={value}>{children}</QuotaContext.Provider>;
}

export function useQuota(): ClientQuotaSnapshot | null {
  return useContext(QuotaContext);
}
