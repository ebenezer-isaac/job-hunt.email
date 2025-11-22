import {
  Timestamp,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { createDebugLogger } from "@/lib/debug-logger";
import { getAccessControlConfig } from "@/lib/security/allowed-users";
import { env } from "@/env";

const collectionName = "userProfiles";

const userProfileLogger = createDebugLogger("user-profile-service");

export type TokenHoldStatus = "active" | "committed" | "released";

export type TokenHold = {
  sessionId: string;
  amount: number;
  status: TokenHoldStatus;
  placedAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
};

export type UserQuota = {
  totalAllocated: number;
  remaining: number;
  onHold: number;
  holds: Record<string, TokenHold>;
};

export type AllocationEntry = {
  amount: number;
  reason?: string;
  updatedBy?: string;
  timestamp: Date;
};

export type UserProfile = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string | null;
  createdAt: Date;
  updatedAt: Date;
  quota: UserQuota;
  allocations: AllocationEntry[];
};

type FirestoreTokenHold = Omit<TokenHold, "placedAt" | "updatedAt" | "expiresAt"> & {
  placedAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt?: Timestamp;
};

type FirestoreUserProfile = Omit<UserProfile, "createdAt" | "updatedAt" | "quota" | "allocations"> & {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  quota: Omit<UserQuota, "holds"> & {
    holds: Record<string, FirestoreTokenHold>;
  };
  allocations: Array<Omit<AllocationEntry, "timestamp"> & { timestamp: Timestamp }>;
};

function collection(): CollectionReference<FirestoreUserProfile> {
  return getDb().collection(collectionName) as CollectionReference<FirestoreUserProfile>;
}

function getRef(uid: string): DocumentReference<FirestoreUserProfile> {
  return collection().doc(uid);
}

export function serializeUserProfile(profile: UserProfile): FirestoreUserProfile {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    photoURL: profile.photoURL,
    createdAt: Timestamp.fromDate(profile.createdAt),
    updatedAt: Timestamp.fromDate(profile.updatedAt),
    quota: {
      totalAllocated: profile.quota.totalAllocated,
      remaining: profile.quota.remaining,
      onHold: profile.quota.onHold,
      holds: Object.fromEntries(
        Object.entries(profile.quota.holds).map(([key, hold]) => [
          key,
          {
            sessionId: hold.sessionId,
            amount: hold.amount,
            status: hold.status,
            placedAt: Timestamp.fromDate(hold.placedAt),
            updatedAt: Timestamp.fromDate(hold.updatedAt),
            expiresAt: hold.expiresAt ? Timestamp.fromDate(hold.expiresAt) : undefined,
          },
        ]),
      ),
    },
    allocations: profile.allocations.map((entry) => ({
      amount: entry.amount,
      reason: entry.reason,
      updatedBy: entry.updatedBy,
      timestamp: Timestamp.fromDate(entry.timestamp),
    })),
  };
}

export function userProfileFromSnapshot(snapshot: DocumentSnapshot<FirestoreUserProfile>): UserProfile {
  const data = snapshot.data();
  if (!data) {
    throw new Error(`User profile ${snapshot.id} missing data`);
  }
  return {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName,
    photoURL: data.photoURL,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
    quota: {
      totalAllocated: data.quota.totalAllocated,
      remaining: data.quota.remaining,
      onHold: data.quota.onHold,
      holds: Object.fromEntries(
        Object.entries(data.quota.holds ?? {}).map(([key, hold]) => [
          key,
          {
            ...hold,
            placedAt: hold.placedAt.toDate(),
            updatedAt: hold.updatedAt.toDate(),
            expiresAt: hold.expiresAt ? hold.expiresAt.toDate() : undefined,
          } satisfies TokenHold,
        ]),
      ),
    },
    allocations: (data.allocations ?? []).map((entry) => ({
      ...entry,
      timestamp: entry.timestamp.toDate(),
    })),
  };
}

export function getUserProfileRef(uid: string): DocumentReference<FirestoreUserProfile> {
  return getRef(uid);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  userProfileLogger.step("Fetching user profile", { uid });
  const snapshot = await getRef(uid).get();
  if (!snapshot.exists) {
    userProfileLogger.info("User profile not found", { uid });
    return null;
  }
  const profile = userProfileFromSnapshot(snapshot);
  userProfileLogger.data("user-profile-loaded", { uid, quota: profile.quota });
  return profile;
}

export type EnsureProfileParams = {
  uid: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
};

export async function ensureUserProfile(params: EnsureProfileParams): Promise<UserProfile> {
  userProfileLogger.step("Ensuring user profile", { uid: params.uid, email: params.email });
  const ref = getRef(params.uid);
  const now = new Date();
  const config = await getAccessControlConfig();
  
  const isAdmin = env.ADMIN_EMAIL && params.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
  const defaultAllocation = isAdmin ? 1000 : config.defaultQuota;

  const profile = await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      userProfileLogger.step("User profile exists", { uid: params.uid });
      return userProfileFromSnapshot(snap);
    }

    userProfileLogger.step("Creating new user profile", { uid: params.uid, defaultAllocation, isAdmin });
    const newProfile: UserProfile = {
      uid: params.uid,
      email: params.email,
      displayName: params.displayName ?? undefined,
      photoURL: params.photoURL ?? null,
      createdAt: now,
      updatedAt: now,
      quota: {
        totalAllocated: defaultAllocation,
        remaining: defaultAllocation,
        onHold: 0,
        holds: {},
      },
      allocations: [
        {
          amount: defaultAllocation,
          reason: "default-allocation",
          updatedBy: "system",
          timestamp: now,
        },
      ],
    };

    tx.set(ref, serializeUserProfile(newProfile));
    userProfileLogger.info("New user profile persisted", { uid: params.uid });
    return newProfile;
  });

  return profile;
}
