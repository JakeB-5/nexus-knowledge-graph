const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "this", "that", "these",
  "those", "it", "its", "not", "no", "nor", "so", "if", "then",
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string, removeStopWords = true): string[] {
  const normalized = normalize(text);
  const tokens = normalized.split(" ").filter((t) => t.length > 0);

  if (removeStopWords) {
    return tokens.filter((t) => !STOP_WORDS.has(t));
  }

  return tokens;
}

export function ngrams(tokens: string[], n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    result.push(tokens.slice(i, i + n).join(" "));
  }
  return result;
}
