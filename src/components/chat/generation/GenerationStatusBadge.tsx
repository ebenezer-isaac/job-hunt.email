import type { GenerationStatus } from "./types";

export function GenerationStatusBadge({ status }: { status: GenerationStatus }) {
  const meta: Record<GenerationStatus, { label: string; bg: string; text: string; dot: string }> = {
    pending: {
      label: "Pending",
      bg: "bg-zinc-100 dark:bg-zinc-800",
      text: "text-zinc-700 dark:text-zinc-300",
      dot: "bg-zinc-500 dark:bg-zinc-400",
    },
    "in-progress": {
      label: "Thinking",
      bg: "bg-amber-100 dark:bg-amber-900/30",
      text: "text-amber-700 dark:text-amber-300",
      dot: "bg-amber-500 dark:bg-amber-400",
    },
    completed: {
      label: "Completed",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      text: "text-emerald-700 dark:text-emerald-300",
      dot: "bg-emerald-500 dark:bg-emerald-400",
    },
    failed: {
      label: "Failed",
      bg: "bg-red-100 dark:bg-red-900/30",
      text: "text-red-700 dark:text-red-300",
      dot: "bg-red-500 dark:bg-red-400",
    },
  };
  const config = meta[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${config.bg} ${config.text}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  );
}
