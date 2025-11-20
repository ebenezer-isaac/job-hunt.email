import validator from "validator";

export function isLikelyJobUrl(value: string): boolean {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return false;
  }
  try {
    return validator.isURL(trimmed, {
      protocols: ["http", "https"],
      require_protocol: true,
    });
  } catch {
    return false;
  }
}
