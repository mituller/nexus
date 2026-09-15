import { Task } from "../types";

// Word-based Jaccard similarity — ignores short words and punctuation
export function taskSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
  const w1 = new Set(normalize(a));
  const w2 = new Set(normalize(b));
  if (w1.size === 0 || w2.size === 0) return 0;
  const intersection = [...w1].filter(w => w2.has(w)).length;
  return intersection / new Set([...w1, ...w2]).size;
}

export const SIMILARITY_THRESHOLD = 0.45;

/** Closest open task above the similarity threshold, or null. */
export function findSimilarTask(title: string, tasks: Task[]): { task: Task; score: number } | null {
  let best: { task: Task; score: number } | null = null;
  for (const t of tasks.filter(t => t.status !== "done")) {
    const score = taskSimilarity(title, t.title);
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { task: t, score };
    }
  }
  return best;
}

/** True when an open task has the exact same title (case/whitespace insensitive). */
export function hasExactTask(title: string, tasks: Task[]): boolean {
  const needle = title.toLowerCase().trim();
  return tasks.some(t => t.status !== "done" && t.title.toLowerCase().trim() === needle);
}
