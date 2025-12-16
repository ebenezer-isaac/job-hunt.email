import type { StoreApi } from "zustand";
import { buildArtifactsFromSession } from "./artifacts";
import type { ChatMessage, SessionStoreState } from "./types";
import { appendOrMerge, extractSessionMode, mergeChatHistories, persistMode, sessionSortValue } from "./utils";

export function createSessionActions(
  set: StoreApi<SessionStoreState>["setState"],
  get: StoreApi<SessionStoreState>["getState"],
): SessionStoreState["actions"] {
  return {
    setSessions: (sessions) => {
      set((state) => {
        const merged = sessions.map((session) => {
          const existing = state.sessions.find((item) => item.id === session.id);
          if (!existing) {
            return session;
          }
          const mergedHistory = mergeChatHistories(session.chatHistory, existing.chatHistory);
          return {
            ...session,
            chatHistory: mergedHistory,
          };
        });
        const activeSessionId = state.currentSessionId;
        const activeSession = activeSessionId ? merged.find((item) => item.id === activeSessionId) : null;
        const artifactsBySession = { ...state.sessionArtifacts };
        const generationBySession = { ...state.sessionGenerating };

        merged.forEach((session) => {
          artifactsBySession[session.id] = buildArtifactsFromSession(session);
          const shouldGenerate = session.status === "processing";
          if (generationBySession[session.id] !== shouldGenerate) {
            generationBySession[session.id] = shouldGenerate;
          }
        });

        const artifacts = activeSessionId ? artifactsBySession[activeSessionId] ?? null : null;
        const nextMode = extractSessionMode(activeSession);
        const nextState: Partial<SessionStoreState> = {
          sessions: merged,
          sessionArtifacts: artifactsBySession,
          sessionGenerating: generationBySession,
          generatedDocuments: artifacts ?? state.generatedDocuments,
          chatHistory: activeSession?.chatHistory ?? state.chatHistory,
          isGenerating: activeSessionId ? Boolean(generationBySession[activeSessionId]) : state.isGenerating,
        };
        if (nextMode && nextMode !== state.mode) {
          persistMode(nextMode);
          nextState.mode = nextMode;
        }
        return nextState;
      });
    },
    selectSession: (sessionId) => {
      const state = get();
      const active = state.sessions.find((session) => session.id === sessionId) ?? null;
      const sessionMode = active ? extractSessionMode(active) : null;
      const resolvedMode = sessionMode ?? state.mode;
      const pendingCarry = state.currentSessionId === null && state.pendingGlobalGeneration;
      const artifactsFromMap = sessionId ? state.sessionArtifacts[sessionId] : null;
      const artifacts = artifactsFromMap ?? buildArtifactsFromSession(active);
      const isGeneratingForSession = sessionId
        ? state.sessionGenerating[sessionId] ?? (pendingCarry ? state.isGenerating : false)
        : false;

      set({
        currentSessionId: sessionId,
        chatHistory: active?.chatHistory ?? [],
        generatedDocuments: artifacts ?? null,
        mode: resolvedMode,
        isGenerating: isGeneratingForSession,
        pendingGlobalGeneration: sessionId ? state.pendingGlobalGeneration : false,
      });
      if (sessionMode) {
        persistMode(resolvedMode);
      }
    },
    setChatHistory: (history) =>
      set((state) => {
        const updatedSessions = state.currentSessionId
          ? state.sessions.map((session) => (session.id === state.currentSessionId ? { ...session, chatHistory: history } : session))
          : state.sessions;
        return {
          chatHistory: history,
          sessions: updatedSessions,
        };
      }),
    appendChatMessage: (sessionId: string, message: ChatMessage) => {
      set((state) => {
        let nextChatHistory = state.chatHistory;
        let matched = false;
        const sessions = state.sessions.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }
          matched = true;
          const updatedHistory = appendOrMerge(session.chatHistory, message);
          if (sessionId === state.currentSessionId) {
            nextChatHistory = updatedHistory;
          }
          return { ...session, chatHistory: updatedHistory };
        });
        if (!matched) {
          return state;
        }
        return { chatHistory: nextChatHistory, sessions };
      });
    },
    setIsGenerating: (sessionId: string | null, value: boolean) =>
      set((state) => {
        if (!sessionId) {
          return {
            isGenerating: value,
            pendingGlobalGeneration: value,
          };
        }
        const sessionGenerating = { ...state.sessionGenerating, [sessionId]: value };
        const affectsCurrent = state.currentSessionId === sessionId;
        return {
          sessionGenerating,
          isGenerating: affectsCurrent ? value : state.isGenerating,
          pendingGlobalGeneration: false,
        };
      }),
    setGeneratedDocuments: (sessionId: string | null, artifacts) =>
      set((state) => {
        if (!sessionId) {
          return { generatedDocuments: artifacts };
        }
        const artifactsBySession = { ...state.sessionArtifacts, [sessionId]: artifacts };
        return {
          sessionArtifacts: artifactsBySession,
          generatedDocuments: state.currentSessionId === sessionId ? artifacts : state.generatedDocuments,
        };
      }),
    setMode: (mode) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("chatMode", mode);
      }
      set({ mode });
    },
    updateSourceDocument: (docType, value) => {
      set((state) => ({
        sourceDocuments: {
          ...state.sourceDocuments,
          [docType]: value,
        },
      }));
    },
    setSessionStatus: (sessionId, status) =>
      set((state) => {
        const index = state.sessions.findIndex((session) => session.id === sessionId);
        if (index === -1) {
          return state;
        }
        const updatedSessions = state.sessions.map((session, idx) => (idx === index ? { ...session, status } : session));
        const sessionGenerating = { ...state.sessionGenerating, [sessionId]: status === "processing" };
        return {
          sessions: updatedSessions,
          sessionGenerating,
          isGenerating: state.currentSessionId === sessionId ? status === "processing" : state.isGenerating,
        };
      }),
    touchSessionTimestamp: (sessionId, timestamp) =>
      set((state) => {
        const iso = timestamp ?? new Date().toISOString();
        const updatedSessions = state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                metadata: {
                  ...session.metadata,
                  lastGeneratedAt: iso,
                },
              }
            : session,
        );
        return { sessions: updatedSessions };
      }),
    setQuota: (quota) => set({ quota }),
    removeSession: (sessionId) =>
      set((state) => {
        if (!state.sessions.some((session) => session.id === sessionId)) {
          return state;
        }
        const sessions = state.sessions.filter((session) => session.id !== sessionId);
        const sessionArtifacts = { ...state.sessionArtifacts };
        delete sessionArtifacts[sessionId];
        const sessionGenerating = { ...state.sessionGenerating };
        delete sessionGenerating[sessionId];
        const updates: Partial<SessionStoreState> = {
          sessions,
          sessionArtifacts,
          sessionGenerating,
        };
        if (state.currentSessionId === sessionId) {
          const nextActive = sessions[0] ?? null;
          updates.currentSessionId = nextActive?.id ?? null;
          updates.chatHistory = nextActive?.chatHistory ?? [];
          updates.generatedDocuments = nextActive ? sessionArtifacts[nextActive.id] ?? null : null;
          updates.isGenerating = nextActive ? Boolean(sessionGenerating[nextActive.id]) : false;
        }
        return updates;
      }),
    upsertSession: (session) =>
      set((state) => {
        const artifacts = buildArtifactsFromSession(session);
        const list = state.sessions.slice();
        const existingIndex = list.findIndex((entry) => entry.id === session.id);
        if (existingIndex >= 0) {
          list[existingIndex] = session;
        } else {
          list.unshift(session);
        }
        list.sort((a, b) => sessionSortValue(b) - sessionSortValue(a));

        const sessionArtifacts = { ...state.sessionArtifacts, [session.id]: artifacts };
        const sessionGenerating = {
          ...state.sessionGenerating,
          [session.id]: session.status === "processing",
        };
        const updates: Partial<SessionStoreState> = {
          sessions: list,
          sessionArtifacts,
          sessionGenerating,
        };
        if (state.currentSessionId === session.id) {
          updates.chatHistory = session.chatHistory;
          updates.generatedDocuments = artifacts ?? null;
          updates.isGenerating = session.status === "processing";
        }
        return updates;
      }),
  };
}
