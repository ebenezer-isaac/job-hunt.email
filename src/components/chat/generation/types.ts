import type { ChatMessage } from "@/store/session-store";

export type GenerationStatus = "pending" | "in-progress" | "completed" | "failed";

export type GenerationLogEntry = {
  id: string;
  content: string;
  timestamp: string;
  level?: "info" | "success" | "warning" | "error";
};

export type GenerationRun = {
  id: string;
  index: number;
  logs: GenerationLogEntry[];
  request?: ChatMessage;
  summary?: ChatMessage;
  startedAt: string;
  lastUpdatedAt: string;
  generationId?: string | null;
  hasStableId: boolean;
};

export type GenerationLogsPanelProps = {
  open: boolean;
  generations: GenerationRun[];
  expandedId: string | null;
  onUserToggle: (id: string | null) => void;
  onClose: () => void;
  isGenerating: boolean;
  onDeleteGeneration: (generation: GenerationRun) => void;
  deletingGenerationId: string | null;
};
