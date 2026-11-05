import { describe, expect, it } from "vitest";
import { Task } from "../types";
import { findSimilarTask, hasExactTask, SIMILARITY_THRESHOLD, taskSimilarity } from "./taskMatching";

function task(title: string, status: Task["status"] = "open"): Task {
  return {
    id: title,
    title,
    status,
    priority: "medium",
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("taskSimilarity", () => {
  it("is 1 for identical titles regardless of case and punctuation", () => {
    expect(taskSimilarity("Review the Budget!", "review the budget")).toBe(1);
  });

  it("is 0 when no words are shared", () => {
    expect(taskSimilarity("review budget", "deploy server")).toBe(0);
  });

  it("is the shared share of all distinct words", () => {
    expect(taskSimilarity("review budget draft", "review budget final")).toBe(0.5);
  });

  it("ignores words of two characters or fewer", () => {
    expect(taskSimilarity("go to budget", "budget")).toBe(1);
  });

  it("is 0 when a title has no usable words", () => {
    expect(taskSimilarity("a b", "budget")).toBe(0);
    expect(taskSimilarity("", "")).toBe(0);
  });
});

describe("findSimilarTask", () => {
  it("returns null when nothing reaches the threshold", () => {
    expect(findSimilarTask("review budget", [task("deploy server")])).toBeNull();
  });

  it("returns the highest-scoring match", () => {
    const close = task("review budget draft");
    const closer = task("review budget");
    const result = findSimilarTask("review budget", [close, closer]);
    expect(result?.task).toBe(closer);
    expect(result?.score).toBe(1);
  });

  it("draws the line at the similarity threshold", () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.45);
    // 4 shared of 9 distinct words is 0.444, just under; 5 of 11 is 0.4545, just over.
    const shared = "alpha bravo charlie delta";
    expect(findSimilarTask(`${shared} echo foxtrot golf`, [task(`${shared} hotel india`)])).toBeNull();
    const shared5 = `${shared} echo`;
    expect(findSimilarTask(`${shared5} foxtrot golf juliet`, [task(`${shared5} hotel india kilo`)])).not.toBeNull();
  });

  it("ignores completed tasks", () => {
    expect(findSimilarTask("review budget", [task("review budget", "done")])).toBeNull();
  });
});

describe("hasExactTask", () => {
  it("matches ignoring case and surrounding whitespace", () => {
    expect(hasExactTask("  Review Budget ", [task("review budget")])).toBe(true);
  });

  it("does not match a partial title", () => {
    expect(hasExactTask("review", [task("review budget")])).toBe(false);
  });

  it("ignores completed tasks", () => {
    expect(hasExactTask("review budget", [task("review budget", "done")])).toBe(false);
  });
});
