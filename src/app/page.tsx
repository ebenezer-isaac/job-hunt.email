import { promises as fs } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat/ChatApp";
import { serializeSessions } from "@/lib/serializers/session";
import { sessionRepository } from "@/lib/session";
import { requireServerAuthTokens } from "@/lib/auth";
import { getSourceDocumentsForUser } from "@/lib/source-documents";
import { LOGIN_PAGE_PATH } from "@/lib/auth-config";
import { ensureUserProfile } from "@/lib/security/user-profile";

async function readSeedFile(filename: string): Promise<string> {
  const projectRoot = path.resolve(process.cwd());
  const filePath = path.join(projectRoot, "source_files", filename);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ sessionId?: string }> }) {
  const tokens = await requireServerAuthTokens().catch(() => null);
  if (!tokens) {
    redirect(`${LOGIN_PAGE_PATH}?next=/`);
  }

  const { sessionId: requestedSessionId } = await searchParams;
  const userId = tokens.decodedToken.uid;
  const userProfile = {
    displayName: tokens.decodedToken.name ?? tokens.decodedToken.email ?? "Workspace",
    email: tokens.decodedToken.email ?? "",
    photoURL: tokens.decodedToken.picture ?? null,
  };

  const [sessionRecords, storedDocuments, cvStrategy, coverLetterStrategy, coldEmailStrategy, reconStrategy, usageProfile] =
    await Promise.all([
      sessionRepository.listSessions(userId),
      getSourceDocumentsForUser(userId),
      readSeedFile("cv_strat.txt"),
      readSeedFile("cover_letter.txt"),
      readSeedFile("cold_mail.txt"),
      readSeedFile("recon_strat.txt"),
      ensureUserProfile({
        uid: userId,
        email: userProfile.email,
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
      }),
    ]);

  const serializedSessions = serializeSessions(sessionRecords);
  const targetSession = requestedSessionId 
    ? serializedSessions.find(s => s.id === requestedSessionId) 
    : null;

  const initialState = {
    sessions: serializedSessions,
    currentSessionId: targetSession?.id ?? null,
    chatHistory: targetSession?.chatHistory ?? [],
    sourceDocuments: {
      originalCV: storedDocuments.originalCV,
      extensiveCV: storedDocuments.extensiveCV,
      cvStrategy: storedDocuments.cvStrategy || cvStrategy || "Maintain ATS compliance and quantified impact per bullet.",
      coverLetterStrategy:
        storedDocuments.coverLetterStrategy || coverLetterStrategy || "Concise one-page letter highlighting 2-3 achievements.",
      coldEmailStrategy:
        storedDocuments.coldEmailStrategy || coldEmailStrategy || "Short, punchy cold email under 150 words.",
      reconStrategy:
        storedDocuments.reconStrategy || reconStrategy || "Deep-dive reconnaissance workflow for identifying decision-makers and signals.",
    },
  };

  const quotaSnapshot = {
    totalAllocated: usageProfile.quota.totalAllocated,
    remaining: usageProfile.quota.remaining,
    onHold: usageProfile.quota.onHold,
  };

  return (
    <ChatApp
      initialState={initialState}
      userId={userId}
      userProfile={userProfile}
      quota={quotaSnapshot}
    />
  );
}
