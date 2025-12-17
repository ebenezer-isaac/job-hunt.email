import { useState } from "react";
import { useDebouncedCallback } from "use-debounce";

export type SaveState = "idle" | "saving" | "saved" | "error";

type UseAutosaveOptions<T> = {
  onSave: (value: T) => Promise<void> | void;
  delayMs?: number;
  onError?: (error: unknown) => void;
};

export function useAutosave<T>({ onSave, delayMs = 800, onError }: UseAutosaveOptions<T>) {
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const debouncedSave = useDebouncedCallback(async (value: T) => {
    setSaveState("saving");
    try {
      await onSave(value);
      setSaveState("saved");
    } catch (error) {
      console.error("Autosave failed", error);
      setSaveState("error");
      onError?.(error);
    }
  }, delayMs);

  const queueSave = (value: T) => {
    debouncedSave(value);
  };

  const flushSave = () => debouncedSave.flush?.();
  const cancelSave = () => debouncedSave.cancel?.();

  return { saveState, setSaveState, queueSave, flushSave, cancelSave };
}