import { getDb } from "@/lib/firebase-admin";
import { createDebugLogger } from "@/lib/debug-logger";
import { getAccessControlConfig } from "@/lib/security/allowed-users";
import {
  ensureUserProfile,
  getUserProfile,
  getUserProfileRef,
  serializeUserProfile,
  userProfileFromSnapshot,
  type TokenHold,
  type UserProfile,
  type UserQuota,
} from "@/lib/security/user-profile";

const quotaLogger = createDebugLogger("quota-service");

export class QuotaExceededError extends Error {
  constructor(message = "You have reached your current allocation.") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class TokenHoldNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Token hold for session ${sessionId} not found`);
    this.name = "TokenHoldNotFoundError";
  }
}

export type QuotaSnapshot = {
  uid: string;
  quota: UserQuota;
};

export type PlaceHoldOptions = {
  uid: string;
  sessionId: string;
  amount?: number;
  holdDurationMs?: number;
};

export type ReleaseHoldOptions = {
  uid: string;
  sessionId: string;
  refund?: boolean;
};

export class QuotaService {
  async ensureProfile(params: {
    uid: string;
    email: string;
    displayName?: string | null;
    photoURL?: string | null;
  }): Promise<UserProfile> {
    quotaLogger.step("Ensuring user profile", { uid: params.uid });
    return ensureUserProfile(params);
  }

  async getQuota(uid: string): Promise<QuotaSnapshot | null> {
    quotaLogger.step("Fetching quota", { uid });
    const profile = await getUserProfile(uid);
    if (!profile) {
      quotaLogger.warn("Quota fetch failed: profile not found", { uid });
      return null;
    }
    return { uid: profile.uid, quota: profile.quota };
  }

  async placeHold(options: PlaceHoldOptions): Promise<{ hold: TokenHold; quota: UserQuota }> {
    const amount = options.amount ?? 1;
    if (amount <= 0) {
      throw new Error("Hold amount must be greater than zero");
    }
    const config = await getAccessControlConfig();
    const holdDurationMs = options.holdDurationMs ?? config.holdTimeoutMinutes * 60_000;
    const ref = getUserProfileRef(options.uid);

    const result = await getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        quotaLogger.error("Attempted to place hold for missing profile", { uid: options.uid });
        throw new Error("User profile not found");
      }
      const profile = userProfileFromSnapshot(snap);
      const now = new Date();
      cleanupExpiredHolds(profile, now);

      const existingHold = profile.quota.holds[options.sessionId];
      if (existingHold && existingHold.status === "active") {
        quotaLogger.info("Hold already exists; refreshing expiry", {
          uid: options.uid,
          sessionId: options.sessionId,
        });
        existingHold.updatedAt = now;
        existingHold.expiresAt = new Date(now.getTime() + holdDurationMs);
        tx.set(ref, serializeUserProfile(profile));
        return { profile, hold: existingHold };
      }

      if (profile.quota.remaining < amount) {
        quotaLogger.warn("Quota exceeded", {
          uid: options.uid,
          remaining: profile.quota.remaining,
          requested: amount,
        });
        throw new QuotaExceededError();
      }

      const hold: TokenHold = {
        sessionId: options.sessionId,
        amount,
        status: "active",
        placedAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + holdDurationMs),
      };

      profile.quota.remaining -= amount;
      profile.quota.onHold += amount;
      profile.quota.holds[options.sessionId] = hold;
      profile.updatedAt = now;

      tx.set(ref, serializeUserProfile(profile));
      return { profile, hold };
    });

    return { hold: result.hold, quota: result.profile.quota };
  }

  async commitHold(uid: string, sessionId: string): Promise<UserQuota> {
    const ref = getUserProfileRef(uid);
    const result = await getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new Error("User profile not found");
      }
      const profile = userProfileFromSnapshot(snap);
      const hold = profile.quota.holds[sessionId];
      if (!hold || hold.status !== "active") {
        quotaLogger.warn("Commit called without active hold", { uid, sessionId });
        return profile.quota;
      }
      profile.quota.onHold = Math.max(0, profile.quota.onHold - hold.amount);
      delete profile.quota.holds[sessionId];
      profile.updatedAt = new Date();
      tx.set(ref, serializeUserProfile(profile));
      return profile.quota;
    });
    return result;
  }

  async releaseHold(options: ReleaseHoldOptions): Promise<UserQuota> {
    const { uid, sessionId, refund = true } = options;
    const ref = getUserProfileRef(uid);
    const result = await getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new Error("User profile not found");
      }
      const profile = userProfileFromSnapshot(snap);
      const hold = profile.quota.holds[sessionId];
      if (!hold || hold.status !== "active") {
        quotaLogger.warn("Release called without active hold", { uid, sessionId });
        return profile.quota;
      }
      profile.quota.onHold = Math.max(0, profile.quota.onHold - hold.amount);
      if (refund) {
        profile.quota.remaining += hold.amount;
      }
      delete profile.quota.holds[sessionId];
      profile.updatedAt = new Date();
      tx.set(ref, serializeUserProfile(profile));
      return profile.quota;
    });
    return result;
  }
}

function cleanupExpiredHolds(profile: UserProfile, now: Date) {
  const expiredEntries = Object.entries(profile.quota.holds).filter(([, hold]) => {
    if (hold.status !== "active") {
      return false;
    }
    if (!hold.expiresAt) {
      return false;
    }
    return hold.expiresAt.getTime() <= now.getTime();
  });

  if (!expiredEntries.length) {
    return;
  }

  let refunded = 0;
  for (const [key, hold] of expiredEntries) {
    refunded += hold.amount;
    delete profile.quota.holds[key];
  }
  profile.quota.onHold = Math.max(0, profile.quota.onHold - refunded);
  profile.quota.remaining += refunded;
  quotaLogger.warn("Expired holds cleaned up", {
    uid: profile.uid,
    refunded,
    remaining: profile.quota.remaining,
  });
}

export const quotaService = new QuotaService();
