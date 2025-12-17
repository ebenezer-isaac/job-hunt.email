export type GenerationStatus = "pending" | "in-progress" | "completed" | "failed";

export type GenerationSummary = {
  id: string;
  content: string;
  timestamp: string;
  level?: "info" | "success" | "warning" | "error";
};

export type GenerationLogEntry = {
  id: string;
  content: string;
  timestamp: string;
  level?: "info" | "success" | "warning" | "error";
};

export type GenerationRun = {
  id: string;
  generationId: string;
  index: number;
  logs: GenerationLogEntry[];
  summary?: GenerationSummary;
  startedAt: string;
  lastUpdatedAt: string;
  hasStableId: boolean;
  status: GenerationStatus;
};

export type GenerationLogsPanelProps = {
  open: boolean;
  generations: GenerationRun[];
  isLoading: boolean;
  expandedId: string | null;
  onUserToggle: (id: string | null) => void;
  onClose: () => void;
  isGenerating: boolean;
  onDeleteGeneration: (generation: GenerationRun) => void;
  deletingGenerationId: string | null;
};
