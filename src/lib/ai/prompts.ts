import "server-only";

import promptCatalog from "@/prompts.json";

type PromptFile = typeof promptCatalog;

export type PromptKey = keyof PromptFile;

type PromptMeta = {
  workflow: string;
  description: string;
};

export type PromptInput<K extends PromptKey> = {
  [Var in PromptFile[K]["variables"][number]]: string | null | undefined;
};

export function getPromptMetadata(key: PromptKey): PromptMeta {
  const definition = promptCatalog[key];
  if (!definition) {
    throw new Error(`Prompt key "${key}" is not defined.`);
  }
  return {
    workflow: definition.workflow,
    description: definition.description,
  };
}

export function renderPrompt<K extends PromptKey>(key: K, data: PromptInput<K>): string {
  const definition = promptCatalog[key];
  if (!definition) {
    throw new Error(`Prompt key "${key}" is not defined.`);
  }

  const variables = definition.variables as ReadonlyArray<keyof PromptInput<K>>;
  let rendered = definition.template;
  for (const variable of variables) {
    const rawValue = data[variable];
    const safeValue = rawValue ?? "";
    const pattern = new RegExp(`\\{\\{${variable}\\}\\}`, "g");
    rendered = rendered.replace(pattern, safeValue);
  }

  return rendered;
}
