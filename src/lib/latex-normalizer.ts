type LatexNormalizationRule = {
  pattern: RegExp;
  replacement: string;
  description: string;
};

const LATEX_NORMALIZATION_RULES: readonly LatexNormalizationRule[] = [
  {
    pattern: /\\Justifying\b/g,
    replacement: "\\justifying",
    description: "Convert capitalized ragged2e alignment command to lowercase",
  },
  {
    pattern: /[“”]/g,
    replacement: '"',
    description: "Replace curly double quotes with ASCII quotes",
  },
  {
    pattern: /[‘’]/g,
    replacement: "'",
    description: "Replace curly single quotes with ASCII apostrophes",
  },
  {
    pattern: /—/g,
    replacement: "---",
    description: "Convert em dash characters to LaTeX em dash",
  },
  {
    pattern: /–/g,
    replacement: "--",
    description: "Convert en dash characters to LaTeX en dash",
  },
  {
    pattern: /…/g,
    replacement: "\\ldots{}",
    description: "Convert ellipsis character to LaTeX command",
  },
  {
    pattern: /\u00A0/g,
    replacement: " ",
    description: "Replace non-breaking spaces with standard spaces",
  },
  {
    pattern: /\\item\s+•/g,
    replacement: "\\item ",
    description: "Strip literal bullet characters that follow \\item",
  },
  {
    pattern: /•/g,
    replacement: "-",
    description: "Replace stray bullet characters with hyphens",
  },
];

export type LatexNormalizationResult = {
  output: string;
  changes: string[];
};

export function normalizeLatexSource(input: string): LatexNormalizationResult {
  let output = input;
  const changes: string[] = [];

  for (const rule of LATEX_NORMALIZATION_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(output)) {
      output = output.replace(rule.pattern, rule.replacement);
      changes.push(rule.description);
    }
  }

  return { output, changes };
}
